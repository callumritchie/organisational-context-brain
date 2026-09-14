import { chooseModelRoute } from '@/src/modules/model-routing/model-router';
import type { ScaleCorpus } from './scale-corpus';

function canRead(actor: 'alex' | 'jamie' | 'morgan', visibility: string) {
  if (visibility === 'everyone') return true;
  if (visibility === 'internal') return actor !== 'morgan';
  return visibility === `${actor}-only`;
}

export function evaluateHypothesisMonitorBenchmark(corpus: ScaleCorpus) {
  const sourceSystems = new Set(corpus.records.map((record) => record.sourceSystem));
  const projects = new Set(corpus.records.map((record) => record.canonicalProjectId));
  const stanceChanged = corpus.records.filter(
    (record) => record.versions[0]!.stance !== record.versions.at(-1)!.stance,
  );
  const detectedStanceChanges = stanceChanged.filter((record) => {
    const first = record.versions[0]!;
    const last = record.versions.at(-1)!;
    return first.contentHashKey !== last.contentHashKey && first.stance !== last.stance;
  });
  let permissionLeaks = 0;
  let evaluations = 0;
  const statuses = {
    insufficient: 0,
    supported: 0,
    contested: 0,
    refuted: 0,
  };
  for (const question of corpus.questions.filter((item) => item.cohort === 'exact-name')) {
    const visible = corpus.records.filter(
      (record) =>
        record.canonicalProjectId === question.canonicalProjectId &&
        !record.deleted &&
        canRead(question.actor, record.visibility),
    );
    const visibleIds = new Set(visible.map((record) => record.id));
    permissionLeaks += question.forbiddenRecordIds.filter((id) => visibleIds.has(id)).length;
    const evidence = visible.filter((record) => record.duplicateOf === null);
    const supporting = evidence.filter((record) => record.versions.at(-1)!.stance === 'SUPPORTS').length;
    const contradicting = evidence.filter((record) => record.versions.at(-1)!.stance === 'CONTRADICTS').length;
    const status =
      supporting === 0 && contradicting > 0
        ? 'refuted'
        : supporting > 0 && contradicting > 0
          ? 'contested'
          : supporting > 0
            ? 'supported'
            : 'insufficient';
    statuses[status] += 1;
    evaluations += 1;
  }
  const eventKeys = corpus.records.map(
    (record) => `${record.sourceSystem}:${record.visibility}:${record.externalId}:${record.versions.at(-1)!.contentHashKey}`,
  );
  const uniqueEventKeys = new Set(eventKeys);
  const route = chooseModelRoute(
    {
      id: 'benchmark',
      mode: 'deterministic-only',
      enabled: true,
      routingRules: {},
      budgetLimits: { dailyInputTokens: 0, monthlyCostMicros: 0 },
      allowedProviders: [],
    },
    {
      deterministicSufficient: true,
      inputCharacters: corpus.records.reduce(
        (sum, record) => sum + record.versions.at(-1)!.body.length,
        0,
      ),
      ambiguity: 0,
      materiality: 1,
    },
  );
  return {
    benchmarkKind: 'deterministic-contract' as const,
    records: corpus.records.length,
    projectsEvaluated: projects.size,
    hypothesisEvaluations: evaluations,
    sourceSystemsCovered: sourceSystems.size,
    sourceSystems: [...sourceSystems].sort(),
    immutableVersions: corpus.records.reduce((sum, record) => sum + record.versions.length, 0),
    stanceChangesExpected: stanceChanged.length,
    stanceChangesDetected: detectedStanceChanges.length,
    duplicateRecordsSuppressed: corpus.records.filter((record) => record.duplicateOf !== null).length,
    uniqueEventKeys: uniqueEventKeys.size,
    eventKeyCollisions: eventKeys.length - uniqueEventKeys.size,
    permissionLeaks,
    epistemicStatuses: statuses,
    modelRoute: route.route,
    externalTokens: route.estimatedInputTokens,
    estimatedCostMicros: route.estimatedCostMicros,
    passed:
      sourceSystems.size === 5 &&
      detectedStanceChanges.length === stanceChanged.length &&
      permissionLeaks === 0 &&
      eventKeys.length === uniqueEventKeys.size &&
      route.route === 'no-model' &&
      route.estimatedInputTokens === 0,
    limitations: [
      'Tests event, permission, version, evidence-state and cost-routing contracts.',
      'Does not claim that open-ended model-generated hypotheses are semantically high quality.',
    ],
  };
}
