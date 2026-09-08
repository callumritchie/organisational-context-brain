import { describe, expect, it } from 'vitest';
import {
  createOpenAIEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  getConfiguredEmbeddingProvider,
} from '@/src/modules/embeddings/embedding-provider';

describe('embedding provider', () => {
  it('stays disabled unless an explicit provider and key are configured', () => {
    expect(getConfiguredEmbeddingProvider({})).toBeNull();
    expect(getConfiguredEmbeddingProvider({ EMBEDDING_PROVIDER: 'openai' })).toBeNull();
  });

  it('requests genuine provider vectors and validates their dimensions', async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestCount = 0;
    let promptTokens = 0;
    const fetchImplementation: typeof fetch = async (_input, request) => {
      requestCount += 1;
      requestBody = JSON.parse(String(request?.body));
      return new Response(JSON.stringify({
        data: [{ index: 0, embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01) }],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const provider = createOpenAIEmbeddingProvider({
      apiKey: 'test-key',
      fetchImplementation,
      onUsage: (usage) => { promptTokens += usage.promptTokens; },
    });
    const [embedding] = await provider.embed(['identity verification abandonment']);
    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(requestCount).toBe(1);
    expect(promptTokens).toBe(4);
    expect(requestBody).toMatchObject({
      model: 'text-embedding-3-small',
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
    });
  });
});
