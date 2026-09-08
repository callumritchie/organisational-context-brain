import { describe, expect, it, vi } from 'vitest';
import { createOpenAIChatProvider, getConfiguredChatProvider } from '@/src/modules/ai/chat-provider';

const evidenceId = '70000000-0000-4000-8000-000000000001';
const input = {
  question: 'Why do customers abandon?',
  epistemicState: {
    status: 'supported' as const,
    supportingEvidence: 1,
    contradictingEvidence: 0,
    assessment: 'Supported.',
  },
  evidence: [{
    id: evidenceId,
    title: 'Verification delay',
    summary: 'Customers pause during verification.',
    stance: 'SUPPORTS' as const,
    confidence: 0.9,
    sourceType: 'research-repository',
    excerpt: 'Customers described long waits.',
  }],
};

describe('OpenAI chat provider', () => {
  it('uses the Responses API with non-stored structured output', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_test',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify({ claims: [{ text: 'Verification delay contributes.', evidenceIds: [evidenceId] }] }) }],
      }],
    }), { status: 200 })) as unknown as typeof fetch;
    const provider = createOpenAIChatProvider({ apiKey: 'test-key', model: 'test-model', fetchImplementation });
    await expect(provider.synthesize(input)).resolves.toEqual({
      responseId: 'resp_test',
      claims: [{ text: 'Verification delay contributes.', evidenceIds: [evidenceId] }],
    });
    const [url, request] = (fetchImplementation as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse((request as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'test-model',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(body.tools).toBeUndefined();
  });

  it('requires an explicit provider mode, provider, key and model', () => {
    expect(getConfiguredChatProvider({ AI_MODE: 'offline' })).toBeNull();
    expect(getConfiguredChatProvider({
      AI_MODE: 'provider', CHAT_PROVIDER: 'openai', OPENAI_API_KEY: 'key', OPENAI_CHAT_MODEL: 'model',
    })).toMatchObject({ id: 'openai', model: 'model' });
  });
});
