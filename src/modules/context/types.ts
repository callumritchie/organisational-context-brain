import { z } from 'zod';

export const contextRequestSchema = z.object({
  query: z.string().trim().min(3).max(500),
  maxEvidence: z.number().int().min(1).max(10).default(6),
}).strict();

export type ContextRequest = z.infer<typeof contextRequestSchema>;

export interface RankingExplanation {
  lexical: number;
  authority: number;
  confidence: number;
  freshness: number;
  total: number;
}

export interface ContextEvidence {
  id: string;
  title: string;
  summary: string;
  stance: 'SUPPORTS' | 'CONTRADICTS';
  confidence: number;
  source: {
    title: string;
    uri: string;
    type: string;
    updatedAt: string;
    excerpt: string;
  };
  provenance: {
    assertionId: string;
    assertionKind: 'source-backed' | 'rule-derived' | 'AI-inferred';
    process: string;
    processVersion: string;
  };
  ranking: RankingExplanation;
}

export interface ContextResponse {
  traceId: string;
  actor: { id: string; name: string; role: string };
  interpretedQuery: {
    intent: string;
    entities: Array<{
      id: string;
      name: string;
      type: string;
      matchedAlias?: string;
      aliasType?: string;
      identityKeys?: Array<{ sourceSystem: string; keyType: string; externalKey: string }>;
    }>;
  };
  summary: string;
  evidence: ContextEvidence[];
  relationships: Array<{ from: string; type: string; to: string }>;
  graph: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      assertionKind: 'source-backed' | 'rule-derived' | 'AI-inferred';
      confidence: number;
    }>;
  };
  sources: Array<{ title: string; uri: string; updatedAt: string }>;
  sourceSystems: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSuccessfulSyncAt: string | null;
  }>;
  ontology: {
    version: string;
    checksum: string;
    status: string;
    resourceTypes: Array<{ name: string; kind: 'entity' | 'content'; description: string }>;
    relationships: Array<{ name: string; from: string[]; to: string[]; description: string }>;
  };
  trace: Array<{ stage: string; detail: string; count?: number }>;
  rankingVersion: string;
  generatedBy: 'deterministic-extractive';
}
