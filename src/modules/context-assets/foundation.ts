import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { assessContextPortfolio } from './quality';
import {
  contextAssetDependencySchema,
  contextAssetSchema,
  metricSpecificationSchema,
  type ContextAsset,
  type ContextAssetDependency,
  type ContextFoundationState,
} from './types';

export const CONTEXT_FOUNDATION_IDS = {
  abandonmentTerm: stableId('context-asset', 'onboarding-abandonment'),
  abandonmentMetric: stableId(
    'context-asset',
    'onboarding-abandonment-rate',
  ),
  diagnosticSkill: stableId(
    'context-asset',
    'diagnose-onboarding-failure',
  ),
} as const;

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function onboardingContextFoundation(
  sourceResourceIds: string[],
  now: Date,
) {
  const validFrom = now.toISOString();
  const nextReviewAt = new Date(
    now.getTime() + 90 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const common = {
    scope: {
      kind: 'project' as const,
      subjectResourceId: IDS.resources.project,
    },
    ownerActorId: IDS.users.alex,
    lifecycle: 'certified' as const,
    authority: 'governed' as const,
    confidence: 0.9,
    version: 1,
    sourceResourceIds,
    validFrom,
    validTo: null,
    lastVerifiedAt: validFrom,
    nextReviewAt,
  };
  const metricSpecification = metricSpecificationSchema.parse({
    measure:
      'Eligible onboarding journeys that do not complete an application',
    unit: 'percentage',
    formula:
      '(eligible journeys started minus eligible applications completed within 7 days) divided by eligible journeys started, multiplied by 100',
    grain: 'Weekly cohort by journey start date',
    dimensions: [
      { key: 'journey_variant', label: 'Journey variant', required: true },
      { key: 'device_type', label: 'Device type', required: false },
      { key: 'eligibility_route', label: 'Eligibility route', required: true },
    ],
    sourceOfTruth: {
      system: 'Atlas product analytics',
      dataset: 'governed_onboarding_journey_facts',
      field: 'completed_application_within_7d',
    },
    observationWindow: 'Seven days after the first eligible journey start',
    exclusions: [
      'Test accounts',
      'Users ineligible before the first application step',
      'Duplicate journey starts within the same seven-day window',
    ],
  });
  const assets: ContextAsset[] = [
    contextAssetSchema.parse({
      ...common,
      resourceId: CONTEXT_FOUNDATION_IDS.abandonmentTerm,
      stableKey: 'onboarding.abandonment',
      semanticUri: 'urn:northstar:context:onboarding.abandonment',
      kind: 'term',
      name: 'Onboarding abandonment',
      definition:
        'An eligible user starts the onboarding journey but does not complete an application inside the governed observation window.',
      specification: {
        preferredLabel: 'Onboarding abandonment',
        aliases: ['drop-off', 'journey abandonment'],
        definition:
          'An eligible user starts the onboarding journey but does not complete an application inside the governed observation window.',
      },
    }),
    contextAssetSchema.parse({
      ...common,
      resourceId: CONTEXT_FOUNDATION_IDS.abandonmentMetric,
      stableKey: 'metric.onboarding-abandonment-rate',
      semanticUri: 'urn:northstar:metric:onboarding-abandonment-rate',
      kind: 'metric',
      name: 'Onboarding abandonment rate',
      definition:
        'The governed percentage used to compare onboarding abandonment across cohorts without changing eligibility, completion or time-window semantics.',
      specification: metricSpecification,
    }),
    contextAssetSchema.parse({
      ...common,
      resourceId: CONTEXT_FOUNDATION_IDS.diagnosticSkill,
      stableKey: 'skill.diagnose-onboarding-failure',
      semanticUri: 'urn:northstar:skill:diagnose-onboarding-failure',
      kind: 'skill',
      name: 'Diagnose onboarding failure before recommending intervention',
      definition:
        'A governed diagnostic procedure that requires comparable measures, permissioned evidence and explicit contradiction handling before a recommendation is made.',
      specification: {
        purpose:
          'Prevent teams from treating a plausible observation as a single proven cause of onboarding failure.',
        trigger:
          'A user or background agent asks why onboarding performance changed or requests an intervention.',
        inputs: [
          'Onboarding abandonment rate',
          'Permitted project evidence',
          'Active hypotheses and contradictions',
        ],
        steps: [
          'Confirm the governed metric definition, cohort, observation window and exclusions.',
          'Segment the measure by journey variant, device type and eligibility route.',
          'Resolve relevant evidence to canonical project, client and hypothesis Resources.',
          'Compare supporting and challenging evidence and preserve unresolved tension.',
          'Recommend the smallest testable intervention with an observable falsification signal.',
        ],
        outputs: [
          'Evidence-backed diagnosis',
          'Reliability assessment',
          'Testable next action',
        ],
        escalation:
          'Escalate to the Project Lead when the metric is stale, dependencies are blocked, or evidence remains contested.',
        ownerRole: 'Project Lead',
      },
    }),
  ];
  const dependencies: ContextAssetDependency[] = [
    contextAssetDependencySchema.parse({
      fromResourceId: CONTEXT_FOUNDATION_IDS.abandonmentMetric,
      toResourceId: CONTEXT_FOUNDATION_IDS.abandonmentTerm,
      type: 'defines',
      rationale:
        'The metric inherits the governed meaning of onboarding abandonment.',
    }),
    contextAssetDependencySchema.parse({
      fromResourceId: CONTEXT_FOUNDATION_IDS.diagnosticSkill,
      toResourceId: CONTEXT_FOUNDATION_IDS.abandonmentMetric,
      type: 'depends-on',
      rationale:
        'The diagnostic procedure must use the governed measure before comparing evidence.',
    }),
    contextAssetDependencySchema.parse({
      fromResourceId: CONTEXT_FOUNDATION_IDS.diagnosticSkill,
      toResourceId: CONTEXT_FOUNDATION_IDS.abandonmentTerm,
      type: 'depends-on',
      rationale:
        'The procedure must preserve the governed meaning of abandonment in its diagnosis.',
    }),
  ];
  return { assets, dependencies, metricSpecification };
}

async function availableProjectEvidence(client: PoolClient) {
  const result = await client.query<{ resource_id: string }>(
    `SELECT resource.id AS resource_id
     FROM relationships edge
     JOIN resources resource ON resource.id = edge.from_resource_id
     WHERE edge.to_resource_id = $1 AND edge.relationship_type = 'BELONGS_TO'
       AND resource.status = 'active'
     ORDER BY resource.id LIMIT 12`,
    [IDS.resources.project],
  );
  return result.rows.map((row) => row.resource_id);
}

export async function bootstrapContextFoundation(now = new Date()) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      IDS.users.ingestion,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const sourceResourceIds = await availableProjectEvidence(client);
    if (sourceResourceIds.length === 0) {
      throw new Error(
        'The onboarding context foundation requires at least one current project evidence Resource.',
      );
    }
    const existingCertification = await client.query<{
      last_verified_at: string | null;
    }>(
      `SELECT last_verified_at FROM context_assets WHERE resource_id = $1`,
      [CONTEXT_FOUNDATION_IDS.abandonmentTerm],
    );
    const certificationTime = existingCertification.rows[0]?.last_verified_at
      ? new Date(existingCertification.rows[0].last_verified_at)
      : now;
    const foundation = onboardingContextFoundation(
      sourceResourceIds,
      certificationTime,
    );
    for (const asset of foundation.assets) {
      const semanticType =
        asset.kind === 'term'
          ? 'ContextTerm'
          : asset.kind === 'metric'
            ? 'MetricDefinition'
            : 'DiagnosticSkill';
      const resourceKind = asset.kind === 'skill' ? 'content' : 'entity';
      await client.query(
        `INSERT INTO resources
          (id, workspace_id, access_scope_id, resource_kind, semantic_type,
           canonical_name, summary, properties)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name,
           summary = EXCLUDED.summary, properties = EXCLUDED.properties,
           updated_at = now()`,
        [
          asset.resourceId,
          IDS.workspace,
          IDS.scopes.everyone,
          resourceKind,
          semanticType,
          asset.name,
          asset.definition,
          { semanticUri: asset.semanticUri, contextAssetKind: asset.kind },
        ],
      );
      if (resourceKind === 'entity') {
        await client.query(
          `INSERT INTO entities (resource_id, normalized_name)
           VALUES ($1, $2) ON CONFLICT (resource_id) DO UPDATE SET
             normalized_name = EXCLUDED.normalized_name`,
          [asset.resourceId, asset.name.toLowerCase()],
        );
      } else {
        await client.query(
          `INSERT INTO content_objects (resource_id, content_type)
           VALUES ($1, $2) ON CONFLICT (resource_id) DO UPDATE SET
             content_type = EXCLUDED.content_type`,
          [asset.resourceId, semanticType],
        );
      }
      await client.query(
        `INSERT INTO context_assets
          (resource_id, workspace_id, stable_key, semantic_uri, asset_kind,
           scope_kind, scope_subject_resource_id, owner_actor_id,
           lifecycle_status, authority_class, definition, confidence,
           version_number, specification, valid_from, valid_to,
           last_verified_at, next_review_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18)
         ON CONFLICT (resource_id) DO UPDATE SET
           definition = EXCLUDED.definition,
           specification = EXCLUDED.specification,
           owner_actor_id = EXCLUDED.owner_actor_id,
           authority_class = EXCLUDED.authority_class,
           updated_at = now()`,
        [
          asset.resourceId,
          IDS.workspace,
          asset.stableKey,
          asset.semanticUri,
          asset.kind,
          asset.scope.kind,
          asset.scope.subjectResourceId,
          asset.ownerActorId,
          asset.lifecycle,
          asset.authority,
          asset.definition,
          asset.confidence,
          asset.version,
          asset.specification,
          asset.validFrom,
          asset.validTo,
          asset.lastVerifiedAt,
          asset.nextReviewAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO metric_definitions
        (resource_id, workspace_id, measure, unit, formula, grain,
         dimensions, source_of_truth, observation_window, exclusions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (resource_id) DO UPDATE SET
         measure = EXCLUDED.measure, unit = EXCLUDED.unit,
         formula = EXCLUDED.formula, grain = EXCLUDED.grain,
         dimensions = EXCLUDED.dimensions,
         source_of_truth = EXCLUDED.source_of_truth,
         observation_window = EXCLUDED.observation_window,
         exclusions = EXCLUDED.exclusions, updated_at = now()`,
      [
        CONTEXT_FOUNDATION_IDS.abandonmentMetric,
        IDS.workspace,
        foundation.metricSpecification.measure,
        foundation.metricSpecification.unit,
        foundation.metricSpecification.formula,
        foundation.metricSpecification.grain,
        JSON.stringify(foundation.metricSpecification.dimensions),
        foundation.metricSpecification.sourceOfTruth,
        foundation.metricSpecification.observationWindow,
        JSON.stringify(foundation.metricSpecification.exclusions),
      ],
    );
    for (const asset of foundation.assets) {
      for (const sourceResourceId of asset.sourceResourceIds) {
        await client.query(
          `INSERT INTO context_asset_sources
            (id, workspace_id, asset_resource_id, source_resource_id, contribution)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (asset_resource_id, source_resource_id) DO NOTHING`,
          [
            stableId(
              'context-asset-source',
              `${asset.resourceId}:${sourceResourceId}`,
            ),
            IDS.workspace,
            asset.resourceId,
            sourceResourceId,
            'Actor-visible project evidence grounds this governed context asset.',
          ],
        );
      }
    }
    for (const dependency of foundation.dependencies) {
      await client.query(
        `INSERT INTO context_asset_dependencies
          (id, workspace_id, from_resource_id, to_resource_id,
           dependency_type, rationale)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (from_resource_id, to_resource_id, dependency_type)
         DO UPDATE SET rationale = EXCLUDED.rationale`,
        [
          stableId(
            'context-asset-dependency',
            `${dependency.fromResourceId}:${dependency.type}:${dependency.toResourceId}`,
          ),
          IDS.workspace,
          dependency.fromResourceId,
          dependency.toResourceId,
          dependency.type,
          dependency.rationale,
        ],
      );
    }
    const assessments = assessContextPortfolio(
      foundation.assets,
      foundation.dependencies,
      now,
    );
    for (const assessment of assessments) {
      const inputDigest = digest({
        asset: foundation.assets.find(
          (asset) => asset.resourceId === assessment.resourceId,
        ),
        dependencies: foundation.dependencies.filter(
          (dependency) =>
            dependency.fromResourceId === assessment.resourceId,
        ),
        result: {
          status: assessment.status,
          score: assessment.score,
          issues: assessment.issues,
        },
        assessedOn: assessment.assessedAt.slice(0, 10),
      });
      await client.query(
        `INSERT INTO context_asset_quality_assessments
          (id, workspace_id, asset_resource_id, evaluator_version, status,
           score, dimensions, issues, input_digest, assessed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (asset_resource_id, evaluator_version, input_digest)
         DO NOTHING`,
        [
          stableId(
            'context-quality-assessment',
            `${assessment.resourceId}:${inputDigest}`,
          ),
          IDS.workspace,
          assessment.resourceId,
          assessment.evaluatorVersion,
          assessment.status,
          assessment.score,
          assessment.dimensions,
          JSON.stringify(assessment.issues),
          inputDigest,
          assessment.assessedAt,
        ],
      );
    }
    await client.query('COMMIT');
    return { assets: foundation.assets.length, assessments };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function readContextFoundationState(
  client: PoolClient,
): Promise<ContextFoundationState> {
  const assets = await client.query<{
    resource_id: string;
    stable_key: string;
    semantic_uri: string;
    asset_kind: ContextAsset['kind'];
    canonical_name: string;
    definition: string;
    lifecycle_status: ContextAsset['lifecycle'];
    authority_class: ContextAsset['authority'];
    owner_name: string | null;
    scope_kind: ContextAsset['scope']['kind'];
    scope_subject_resource_id: string | null;
    version_number: number;
    specification: Record<string, unknown>;
    quality_status: 'ready' | 'attention' | 'blocked' | null;
    quality_score: number | null;
    quality_dimensions: ContextFoundationState['assets'][number]['quality'] extends infer Q
      ? Q extends { dimensions: infer D }
        ? D
        : never
      : never;
    quality_issues: ContextFoundationState['assets'][number]['quality'] extends infer Q
      ? Q extends { issues: infer I }
        ? I
        : never
      : never;
    evaluator_version: 'context-quality-v1' | null;
    assessed_at: string | null;
  }>(
    `SELECT asset.resource_id, asset.stable_key, asset.semantic_uri,
       asset.asset_kind, resource.canonical_name, asset.definition,
       asset.lifecycle_status, asset.authority_class, owner.name AS owner_name,
       asset.scope_kind, asset.scope_subject_resource_id, asset.version_number,
       asset.specification, quality.status AS quality_status,
       quality.score AS quality_score, quality.dimensions AS quality_dimensions,
       quality.issues AS quality_issues,
       quality.evaluator_version, quality.assessed_at
     FROM context_assets asset
     JOIN resources resource ON resource.id = asset.resource_id
     LEFT JOIN users owner ON owner.id = asset.owner_actor_id
     LEFT JOIN LATERAL (
       SELECT * FROM context_asset_quality_assessments assessment
       WHERE assessment.asset_resource_id = asset.resource_id
       ORDER BY assessment.assessed_at DESC LIMIT 1
     ) quality ON true
     WHERE asset.lifecycle_status IN ('candidate', 'certified')
     ORDER BY CASE asset.asset_kind
       WHEN 'term' THEN 0 WHEN 'metric' THEN 1 WHEN 'skill' THEN 2 ELSE 3 END,
       asset.stable_key`,
  );
  if (assets.rows.length === 0) {
    return {
      scenario: {
        id: 'onboarding-diagnosis-v1',
        title: 'Diagnose onboarding failure',
        purpose: 'Use governed meaning before recommending an intervention.',
      },
      status: 'not-configured',
      assets: [],
      dependencies: [],
      summary: {
        assetCount: 0,
        certifiedCount: 0,
        readyCount: 0,
        blockingIssueCount: 0,
      },
    };
  }
  const dependencies = await client.query<{
    from_resource_id: string;
    to_resource_id: string;
    dependency_type: ContextAssetDependency['type'];
    rationale: string;
  }>(
    `SELECT from_resource_id, to_resource_id, dependency_type, rationale
     FROM context_asset_dependencies ORDER BY created_at, id`,
  );
  const mappedAssets: ContextFoundationState['assets'] = assets.rows.map(
    (asset) => ({
      resourceId: asset.resource_id,
      stableKey: asset.stable_key,
      semanticUri: asset.semantic_uri,
      kind: asset.asset_kind,
      name: asset.canonical_name,
      definition: asset.definition,
      lifecycle: asset.lifecycle_status,
      authority: asset.authority_class,
      owner: asset.owner_name,
      scope: {
        kind: asset.scope_kind,
        subjectResourceId: asset.scope_subject_resource_id,
      },
      version: asset.version_number,
      specification: asset.specification,
      quality:
        asset.quality_status &&
        asset.quality_score !== null &&
        asset.evaluator_version &&
        asset.assessed_at
          ? {
              resourceId: asset.resource_id,
              evaluatorVersion: asset.evaluator_version,
              status: asset.quality_status,
              score: asset.quality_score,
              dimensions: asset.quality_dimensions,
              issues: asset.quality_issues,
              assessedAt: asset.assessed_at,
            }
          : null,
    }),
  );
  const blockingIssueCount = mappedAssets.reduce(
    (total, asset) =>
      total +
      (asset.quality?.issues.filter((issue) => issue.severity === 'blocking')
        .length ?? 0),
    0,
  );
  const hasBlocked = mappedAssets.some(
    (asset) => asset.quality?.status === 'blocked',
  );
  const hasAttention = mappedAssets.some(
    (asset) => !asset.quality || asset.quality.status === 'attention',
  );
  return {
    scenario: {
      id: 'onboarding-diagnosis-v1',
      title: 'Diagnose onboarding failure',
      purpose:
        'Use governed terminology, a comparable measure and a diagnostic procedure before recommending an intervention.',
    },
    status: hasBlocked ? 'blocked' : hasAttention ? 'attention' : 'ready',
    assets: mappedAssets,
    dependencies: dependencies.rows.map((dependency) => ({
      fromResourceId: dependency.from_resource_id,
      toResourceId: dependency.to_resource_id,
      type: dependency.dependency_type,
      rationale: dependency.rationale,
    })),
    summary: {
      assetCount: mappedAssets.length,
      certifiedCount: mappedAssets.filter(
        (asset) => asset.lifecycle === 'certified',
      ).length,
      readyCount: mappedAssets.filter(
        (asset) => asset.quality?.status === 'ready',
      ).length,
      blockingIssueCount,
    },
  };
}
