import type {
  DiscoveredHypothesis,
  DiscoveryConceptRule,
  DiscoveryDocument,
  DiscoveryPolicyContract,
} from './types';

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length > 3),
  );
}

function similarity(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function documentsForRule(
  rule: DiscoveryConceptRule,
  documents: DiscoveryDocument[],
) {
  return documents.filter((document) => {
    const haystack = normalize(`${document.title} ${document.body}`);
    return rule.keywords.some((keyword) =>
      haystack.includes(normalize(keyword)),
    );
  });
}

function sourceKey(document: DiscoveryDocument) {
  return document.sourceId ?? document.sourceSystem;
}

export function discoverHypotheses(
  documents: DiscoveryDocument[],
  policy: DiscoveryPolicyContract,
): DiscoveredHypothesis[] {
  const matched = policy.conceptRules
    .map((rule) => {
      const evidence = documentsForRule(rule, documents);
      return {
        rule,
        evidence,
        sourceDiversity: new Set(evidence.map(sourceKey))
          .size,
      };
    })
    .filter((match) => match.sourceDiversity >= policy.minimumSourceDiversity)
    .sort(
      (left, right) =>
        right.sourceDiversity - left.sourceDiversity ||
        right.evidence.length - left.evidence.length ||
        left.rule.id.localeCompare(right.rule.id),
    );
  if (!matched.length) return [];
  const primary = matched[0]!;
  const secondary = matched.find(
    (candidate) =>
      candidate.rule.id !== primary.rule.id &&
      candidate.evidence.some((item) =>
        primary.evidence.some(
          (primaryItem) => primaryItem.resourceId === item.resourceId,
        ),
      ),
  );
  const selected = secondary ? [primary, secondary] : [primary];
  const statement = secondary
    ? `${policy.subject} is driven by ${primary.rule.hypothesisFragment}, amplified by ${secondary.rule.hypothesisFragment}.`
    : `${policy.subject} is driven by ${primary.rule.hypothesisFragment}.`;
  const evidence = [
    ...new Map(
      selected
        .flatMap((match) => match.evidence)
        .map((document) => [document.resourceId, document]),
    ).values(),
  ];
  const sourceDiversity = new Set(evidence.map(sourceKey)).size;
  const strongestExistingSimilarity = Math.max(
    0,
    ...(policy.existingHypotheses ?? []).map((existing) =>
      similarity(statement, existing),
    ),
  );
  const noveltyScore =
    Math.round((1 - strongestExistingSimilarity) * 100) / 100;
  const confidence = Math.min(
    0.95,
    Math.round(
      (0.5 + sourceDiversity * 0.07 + Math.min(0.1, evidence.length * 0.01)) *
        100,
    ) / 100,
  );
  return [
    {
      statement,
      rationale: `${evidence.length} unlabeled records across ${sourceDiversity} independent source systems repeatedly connect ${selected.map((match) => match.rule.label.toLowerCase()).join(' with ')}. This is a candidate explanation, not an accepted fact.`,
      concepts: selected.map((match) => ({
        id: match.rule.id,
        label: match.rule.label,
        evidenceCount: match.evidence.length,
        sourceDiversity: match.sourceDiversity,
      })),
      evidence,
      predictions: selected.map((match) => match.rule.prediction),
      falsificationConditions: selected.map(
        (match) => match.rule.falsificationCondition,
      ),
      confidence,
      noveltyScore,
      sourceDiversity,
    },
  ];
}
