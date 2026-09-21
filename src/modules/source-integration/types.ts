import { z } from 'zod';

export const sourceTransportSchema = z.enum(['api', 'cli', 'mcp']);
export const sourceStrategySchema = z.enum([
  'synchronised-copy',
  'authoritative-snapshot',
  'federated-query',
]);
export const artifactModalitySchema = z.enum([
  'document',
  'table',
  'transcript',
  'image',
]);

const artifactBaseSchema = z.object({
  externalId: z.string().trim().min(1).max(255),
  uri: z.string().trim().min(3).max(1_000),
  title: z.string().trim().min(3).max(240),
  mediaType: z.string().trim().min(3).max(120),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  visibility: z.enum(['everyone', 'internal', 'alex-only', 'jamie-only']),
  deleted: z.boolean().default(false),
});

export const externalArtifactSchema = z.discriminatedUnion('modality', [
  artifactBaseSchema.extend({
    modality: z.literal('document'),
    payload: z.object({
      pages: z
        .array(
          z.object({
            page: z.number().int().positive(),
            text: z.string().min(1),
          }),
        )
        .min(1),
    }),
  }),
  artifactBaseSchema.extend({
    modality: z.literal('table'),
    payload: z.object({
      sheet: z.string().trim().min(1).max(120),
      columns: z.array(z.string().trim().min(1).max(120)).min(2),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
    }),
  }),
  artifactBaseSchema.extend({
    modality: z.literal('transcript'),
    payload: z.object({
      segments: z
        .array(
          z.object({
            id: z.string().min(1),
            speaker: z.string().min(1),
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().positive(),
            text: z.string().min(1),
          }),
        )
        .min(1),
    }),
  }),
  artifactBaseSchema.extend({
    modality: z.literal('image'),
    payload: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      regions: z
        .array(
          z.object({
            id: z.string().min(1),
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            text: z.string().min(1),
            role: z.enum(['label', 'value', 'status', 'annotation']),
          }),
        )
        .min(1),
    }),
  }),
]);

export type ExternalArtifact = z.infer<typeof externalArtifactSchema>;

export interface ExternalSourceDescriptor {
  id: string;
  provider: string;
  name: string;
  transport: z.infer<typeof sourceTransportSchema>;
  strategy: z.infer<typeof sourceStrategySchema>;
  endpointLabel: string;
  entitlementRevision: string;
  freshnessSlaSeconds: number;
  deletionMode:
    | 'source-tombstone'
    | 'authoritative-snapshot'
    | 'query-time-authority';
  capabilities: Array<'content' | 'metadata' | 'permissions' | 'deletions'>;
}

export interface ExternalArtifactPage {
  artifacts: ExternalArtifact[];
  nextCursor: string;
  entitlementRevision: string;
  simulatedOperation: {
    command: string;
    responseShape: string;
  };
}

export interface ExternalSourceAdapter {
  readonly descriptor: ExternalSourceDescriptor;
  listProjectChanges(
    externalProjectId: string,
    cursor?: string | null,
  ): Promise<ExternalArtifactPage>;
}

export type ObservationLocator =
  | {
      modality: 'document';
      page: number;
      startOffset: number;
      endOffset: number;
    }
  | {
      modality: 'table';
      sheet: string;
      row: number;
      columns: string[];
    }
  | {
      modality: 'transcript';
      segmentId: string;
      startMs: number;
      endMs: number;
    }
  | {
      modality: 'image';
      regionId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };

export interface PerceivedObservation {
  observationType: 'fact' | 'metric' | 'quote' | 'visual-signal';
  statement: string;
  excerpt: string;
  confidence: number;
  locator: ObservationLocator;
  governedTerms: string[];
  relationship?: {
    subjectRef: 'atlas-onboarding';
    predicate: 'INDICATES' | 'CHALLENGES' | 'MEASURES';
    objectRef: 'onboarding-abandonment';
  };
}

export interface SourceIntegrationState {
  configured: boolean;
  simulated: true;
  project: { id: string; name: string };
  connections: Array<{
    id: string;
    name: string;
    provider: string;
    transport: z.infer<typeof sourceTransportSchema>;
    strategy: z.infer<typeof sourceStrategySchema>;
    freshness: 'current' | 'stale';
    entitlementRevision: string;
    deletionMode: ExternalSourceDescriptor['deletionMode'];
    lastSuccessfulSyncAt: string | null;
  }>;
  artifacts: Array<{
    id: string;
    connectionId: string;
    sourceObjectVersionId: string;
    title: string;
    modality: z.infer<typeof artifactModalitySchema>;
    mediaType: string;
    updatedAt: string;
    observationCount: number;
    observations: Array<{
      id: string;
      type: PerceivedObservation['observationType'];
      statement: string;
      confidence: number;
      locator: ObservationLocator;
      process: string;
      assertions: Array<{
        id: string;
        relationshipId: string;
        predicate: 'DERIVED_FROM' | 'INDICATES' | 'CHALLENGES' | 'MEASURES';
        objectResourceId: string;
        objectName: string;
        objectType: string;
        assertionKind: 'source-backed' | 'rule-derived' | 'AI-inferred';
        confidence: number;
      }>;
    }>;
  }>;
  summary: {
    connectionCount: number;
    artifactCount: number;
    observationCount: number;
    modalities: number;
    externalCallsMade: 0;
  };
  compounding?: {
    policyId: string;
    schedule: 'active' | 'paused';
    nextEvaluationAt: string | null;
    pendingJobs: number;
    hypothesis: {
      id: string;
      status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
      statement: string;
      rationale: string;
      confidence: number;
      sourceDiversity: number;
      evidenceCount: number;
      evidenceResourceIds: string[];
      evidence: Array<{
        artifactId: string;
        sourceObjectVersionId: string;
        connectionId: string;
        artifactTitle: string;
        modality: z.infer<typeof artifactModalitySchema>;
        observationIds: string[];
      }>;
      observationEvidence: Array<{
        id: string;
        role: 'supports' | 'challenges';
        rationale: string;
        artifactId: string;
        artifactTitle: string;
        observationId: string;
        observationStatement: string;
        locator: ObservationLocator;
        assertionId: string;
        predicate: string;
        objectResourceId: string;
        objectName: string;
      }>;
      predictions: string[];
      falsificationConditions: string[];
      process: string;
      lastObservedAt: string;
    } | null;
  };
}
