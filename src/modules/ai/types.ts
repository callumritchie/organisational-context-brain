import type { ContextResponse } from '@/src/modules/context/types';

export interface AuthorisedEvidenceItem {
  id: string;
  title: string;
  summary: string;
  stance: 'SUPPORTS' | 'CONTRADICTS';
  confidence: number;
  sourceType: string;
  excerpt: string;
}

export interface ChatSynthesisInput {
  question: string;
  epistemicState: ContextResponse['epistemicState'];
  evidence: AuthorisedEvidenceItem[];
}

export interface GroundedClaim {
  text: string;
  evidenceIds: string[];
}

export interface ChatProviderResult {
  responseId: string;
  claims: GroundedClaim[];
}

export interface ChatProvider {
  id: string;
  model: string;
  synthesize(input: ChatSynthesisInput): Promise<ChatProviderResult>;
}

export interface AnswerResponse {
  context: ContextResponse;
  answer: {
    mode: 'deterministic' | 'provider';
    text: string;
    claims: GroundedClaim[];
    provider: string | null;
    model: string | null;
    responseId: string | null;
    fallbackReason: 'not-configured' | 'provider-error' | 'citation-validation-failed' | null;
  };
}
