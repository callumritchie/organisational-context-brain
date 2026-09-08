import { z } from 'zod';

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions: typeof EMBEDDING_DIMENSIONS;
  embed(inputs: string[]): Promise<number[][]>;
}

export interface EmbeddingUsage {
  promptTokens: number;
  totalTokens: number;
}

const responseSchema = z.object({
  data: z.array(z.object({
    embedding: z.array(z.number()),
    index: z.number().int().nonnegative(),
  })),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).optional(),
});

export function createOpenAIEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
  onUsage?: (usage: EmbeddingUsage) => void;
}): EmbeddingProvider {
  const model = options.model ?? 'text-embedding-3-small';
  const fetchImplementation = options.fetchImplementation ?? fetch;
  return {
    id: 'openai',
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(inputs) {
      if (!inputs.length || inputs.some((input) => !input.trim())) {
        throw new Error('Embedding inputs must be non-empty');
      }
      const response = await fetchImplementation('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: inputs,
          model,
          dimensions: EMBEDDING_DIMENSIONS,
          encoding_format: 'float',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);
      const parsed = responseSchema.parse(await response.json());
      if (parsed.usage) {
        options.onUsage?.({
          promptTokens: parsed.usage.prompt_tokens,
          totalTokens: parsed.usage.total_tokens,
        });
      }
      const ordered = [...parsed.data].sort((left, right) => left.index - right.index);
      if (ordered.length !== inputs.length) throw new Error('Embedding provider returned an unexpected result count');
      for (const item of ordered) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS || item.embedding.some((value) => !Number.isFinite(value))) {
          throw new Error(`Embedding provider must return ${EMBEDDING_DIMENSIONS} finite dimensions`);
        }
      }
      return ordered.map((item) => item.embedding);
    },
  };
}

export function getConfiguredEmbeddingProvider(
  environment: Record<string, string | undefined> = process.env,
): EmbeddingProvider | null {
  if (environment.EMBEDDING_PROVIDER !== 'openai' || !environment.OPENAI_API_KEY) return null;
  return createOpenAIEmbeddingProvider({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_EMBEDDING_MODEL,
  });
}
