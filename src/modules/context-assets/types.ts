import { z } from 'zod';

export const contextAssetKindSchema = z.enum([
  'term',
  'taxonomy-concept',
  'ontology-component',
  'metric',
  'policy',
  'norm',
  'skill',
  'memory',
]);

export const contextAssetScopeSchema = z.object({
  kind: z.enum(['person', 'project', 'client', 'domain', 'organisation']),
  subjectResourceId: z.string().uuid().nullable(),
});

export const contextAssetLifecycleSchema = z.enum([
  'draft',
  'candidate',
  'certified',
  'superseded',
  'retired',
]);

export const contextAssetAuthoritySchema = z.enum([
  'authoritative',
  'governed',
  'expert',
  'observed',
  'inferred',
]);

export const termSpecificationSchema = z
  .object({
    preferredLabel: z.string().trim().min(2).max(120),
    aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    definition: z.string().trim().min(20).max(2_000),
  })
  .strict();

export const metricSpecificationSchema = z
  .object({
    measure: z.string().trim().min(3).max(200),
    unit: z.enum(['count', 'percentage', 'ratio', 'currency', 'duration']),
    formula: z.string().trim().min(10).max(2_000),
    grain: z.string().trim().min(3).max(240),
    dimensions: z
      .array(
        z
          .object({
            key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
            label: z.string().trim().min(2).max(120),
            required: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    sourceOfTruth: z
      .object({
        system: z.string().trim().min(2).max(120),
        dataset: z.string().trim().min(2).max(240),
        field: z.string().trim().min(1).max(240).optional(),
      })
      .strict(),
    observationWindow: z.string().trim().min(3).max(240),
    exclusions: z.array(z.string().trim().min(3).max(500)).max(20).default([]),
  })
  .strict();

export const skillSpecificationSchema = z
  .object({
    purpose: z.string().trim().min(20).max(1_000),
    trigger: z.string().trim().min(10).max(500),
    inputs: z.array(z.string().trim().min(2).max(240)).min(1).max(20),
    steps: z.array(z.string().trim().min(10).max(500)).min(2).max(20),
    outputs: z.array(z.string().trim().min(2).max(240)).min(1).max(20),
    escalation: z.string().trim().min(10).max(500),
    ownerRole: z.string().trim().min(2).max(120),
  })
  .strict();

export const contextAssetSchema = z
  .object({
    resourceId: z.string().uuid(),
    stableKey: z.string().trim().regex(/^[a-z][a-z0-9.-]{2,127}$/),
    semanticUri: z.string().trim().min(3).max(500),
    kind: contextAssetKindSchema,
    name: z.string().trim().min(2).max(240),
    definition: z.string().trim().min(20).max(4_000),
    scope: contextAssetScopeSchema,
    ownerActorId: z.string().uuid().nullable(),
    lifecycle: contextAssetLifecycleSchema,
    authority: contextAssetAuthoritySchema,
    confidence: z.number().min(0).max(1),
    version: z.number().int().positive(),
    sourceResourceIds: z.array(z.string().uuid()).max(100),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime().nullable(),
    lastVerifiedAt: z.string().datetime().nullable(),
    nextReviewAt: z.string().datetime().nullable(),
    specification: z.record(z.string(), z.unknown()),
  })
  .strict();

export const contextAssetDependencySchema = z
  .object({
    fromResourceId: z.string().uuid(),
    toResourceId: z.string().uuid(),
    type: z.enum([
      'depends-on',
      'defines',
      'governs',
      'measures',
      'executes',
      'uses-evidence',
    ]),
    rationale: z.string().trim().min(10).max(1_000),
  })
  .strict();

export type ContextAsset = z.infer<typeof contextAssetSchema>;
export type ContextAssetKind = z.infer<typeof contextAssetKindSchema>;
export type ContextAssetDependency = z.infer<
  typeof contextAssetDependencySchema
>;
export type MetricSpecification = z.infer<typeof metricSpecificationSchema>;
export type SkillSpecification = z.infer<typeof skillSpecificationSchema>;

export interface ContextQualityIssue {
  code:
    | 'missing-owner'
    | 'missing-provenance'
    | 'invalid-specification'
    | 'stale-certification'
    | 'outside-validity-window'
    | 'unresolved-dependency'
    | 'competing-current-version';
  severity: 'warning' | 'blocking';
  message: string;
}

export interface ContextQualityAssessment {
  resourceId: string;
  evaluatorVersion: 'context-quality-v1';
  status: 'ready' | 'attention' | 'blocked';
  score: number;
  dimensions: {
    ownership: number;
    provenance: number;
    freshness: number;
    confidence: number;
    completeness: number;
    dependencyIntegrity: number;
    versionIntegrity: number;
  };
  issues: ContextQualityIssue[];
  assessedAt: string;
}

export interface ContextFoundationState {
  scenario: {
    id: 'onboarding-diagnosis-v1';
    title: string;
    purpose: string;
  };
  status: 'ready' | 'attention' | 'blocked' | 'not-configured';
  assets: Array<{
    resourceId: string;
    stableKey: string;
    semanticUri: string;
    kind: ContextAssetKind;
    name: string;
    definition: string;
    lifecycle: z.infer<typeof contextAssetLifecycleSchema>;
    authority: z.infer<typeof contextAssetAuthoritySchema>;
    owner: string | null;
    scope: z.infer<typeof contextAssetScopeSchema>;
    version: number;
    quality: ContextQualityAssessment | null;
    specification: Record<string, unknown>;
  }>;
  dependencies: ContextAssetDependency[];
  summary: {
    assetCount: number;
    certifiedCount: number;
    readyCount: number;
    blockingIssueCount: number;
  };
}
