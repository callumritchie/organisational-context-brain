import { describe, expect, it } from 'vitest';
import { synthesizeAuthorisedContext } from '@/src/modules/ai/answer-service';
import type { ChatProvider } from '@/src/modules/ai/types';
import type { ContextResponse } from '@/src/modules/context/types';

const supportId = '70000000-0000-4000-8000-000000000001';
const contradictionId = '70000000-0000-4000-8000-000000000002';
const context = {
  summary: 'The evidence is contested.',
  epistemicState: {
    status: 'contested', supportingEvidence: 1, contradictingEvidence: 1, assessment: 'Contested.',
  },
  evidence: [
    { id: supportId, title: 'Support', summary: 'Supports.', stance: 'SUPPORTS', confidence: 0.9, source: { type: 'research', excerpt: 'Support excerpt.' } },
    { id: contradictionId, title: 'Contradiction', summary: 'Contradicts.', stance: 'CONTRADICTS', confidence: 0.8, source: { type: 'meeting', excerpt: 'Contradiction excerpt.' } },
  ],
} as ContextResponse;

function provider(evidenceIds: string[]): ChatProvider {
  return {
    id: 'test',
    model: 'test-model',
    async synthesize() {
      return { responseId: 'response-1', claims: [{ text: 'A grounded claim.', evidenceIds }] };
    },
  };
}

describe('answer grounding', () => {
  it('accepts visible citations including contradictory evidence', async () => {
    await expect(synthesizeAuthorisedContext('Why?', context, provider([supportId, contradictionId])))
      .resolves.toMatchObject({ mode: 'provider', fallbackReason: null });
  });

  it('rejects unknown evidence IDs', async () => {
    await expect(synthesizeAuthorisedContext(
      'Why?', context, provider(['70000000-0000-4000-8000-000000000099']),
    )).resolves.toMatchObject({ mode: 'deterministic', fallbackReason: 'citation-validation-failed' });
  });

  it('rejects a contested synthesis that omits all contradictory evidence', async () => {
    await expect(synthesizeAuthorisedContext('Why?', context, provider([supportId])))
      .resolves.toMatchObject({ mode: 'deterministic', fallbackReason: 'citation-validation-failed' });
  });
});
