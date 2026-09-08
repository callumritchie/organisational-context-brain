import { assembleContext } from '@/src/modules/context/context-service';
import type { ContextRequest, ContextResponse } from '@/src/modules/context/types';
import { getConfiguredChatProvider } from './chat-provider';
import type { AnswerResponse, ChatProvider, GroundedClaim } from './types';

function deterministicAnswer(
  context: ContextResponse,
  fallbackReason: AnswerResponse['answer']['fallbackReason'],
): AnswerResponse['answer'] {
  return {
    mode: 'deterministic',
    text: context.summary,
    claims: [{ text: context.summary, evidenceIds: context.evidence.map((item) => item.id) }],
    provider: null,
    model: null,
    responseId: null,
    fallbackReason,
  };
}

function citationsAreValid(context: ContextResponse, claims: GroundedClaim[]) {
  const visibleEvidenceIds = new Set(context.evidence.map((item) => item.id));
  if (!claims.length || claims.some((claim) => !claim.text.trim() || !claim.evidenceIds.length)) return false;
  if (claims.some((claim) => claim.evidenceIds.some((id) => !visibleEvidenceIds.has(id)))) return false;
  if (context.epistemicState.status === 'contested') {
    const contradictingIds = new Set(context.evidence
      .filter((item) => item.stance === 'CONTRADICTS')
      .map((item) => item.id));
    if (![...claims.flatMap((claim) => claim.evidenceIds)].some((id) => contradictingIds.has(id))) return false;
  }
  return true;
}

export async function synthesizeAuthorisedContext(
  question: string,
  context: ContextResponse,
  provider: ChatProvider | null,
): Promise<AnswerResponse['answer']> {
  if (!provider) return deterministicAnswer(context, 'not-configured');
  try {
    const result = await provider.synthesize({
      question,
      epistemicState: context.epistemicState,
      evidence: context.evidence.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        stance: item.stance,
        confidence: item.confidence,
        sourceType: item.source.type,
        excerpt: item.source.excerpt,
      })),
    });
    if (!citationsAreValid(context, result.claims)) {
      return deterministicAnswer(context, 'citation-validation-failed');
    }
    return {
      mode: 'provider',
      text: result.claims.map((claim) => claim.text).join(' '),
      claims: result.claims,
      provider: provider.id,
      model: provider.model,
      responseId: result.responseId,
      fallbackReason: null,
    };
  } catch {
    return deterministicAnswer(context, 'provider-error');
  }
}

export async function answerQuestion(
  actor: { id: string; workspaceId: string; name: string; role: string },
  request: ContextRequest,
  provider: ChatProvider | null = getConfiguredChatProvider(),
): Promise<AnswerResponse> {
  const context = await assembleContext(actor, request);
  const answer = await synthesizeAuthorisedContext(request.query, context, provider);
  return { context, answer };
}
