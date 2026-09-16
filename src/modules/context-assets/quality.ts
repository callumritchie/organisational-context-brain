import {
  contextAssetSchema,
  metricSpecificationSchema,
  skillSpecificationSchema,
  termSpecificationSchema,
  type ContextAsset,
  type ContextAssetDependency,
  type ContextQualityAssessment,
  type ContextQualityIssue,
} from './types';

function specificationIsComplete(asset: ContextAsset) {
  if (asset.kind === 'term') {
    return termSpecificationSchema.safeParse(asset.specification).success;
  }
  if (asset.kind === 'metric') {
    return metricSpecificationSchema.safeParse(asset.specification).success;
  }
  if (asset.kind === 'skill') {
    return skillSpecificationSchema.safeParse(asset.specification).success;
  }
  return Object.keys(asset.specification).length > 0;
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function assessContextPortfolio(
  rawAssets: ContextAsset[],
  dependencies: ContextAssetDependency[],
  assessedAt: Date,
): ContextQualityAssessment[] {
  const assets = rawAssets.map((asset) => contextAssetSchema.parse(asset));
  const availableIds = new Set(assets.map((asset) => asset.resourceId));
  const currentVersions = new Map<string, number>();
  for (const asset of assets) {
    if (!['certified', 'candidate'].includes(asset.lifecycle)) continue;
    currentVersions.set(
      asset.stableKey,
      (currentVersions.get(asset.stableKey) ?? 0) + 1,
    );
  }

  return assets.map((asset) => {
    const issues: ContextQualityIssue[] = [];
    const now = assessedAt.getTime();
    const validFrom = Date.parse(asset.validFrom);
    const validTo = asset.validTo ? Date.parse(asset.validTo) : null;
    const nextReview = asset.nextReviewAt
      ? Date.parse(asset.nextReviewAt)
      : null;
    const assetDependencies = dependencies.filter(
      (dependency) => dependency.fromResourceId === asset.resourceId,
    );
    const unresolvedDependencies = assetDependencies.filter(
      (dependency) => !availableIds.has(dependency.toResourceId),
    );

    if (!asset.ownerActorId) {
      issues.push({
        code: 'missing-owner',
        severity: 'blocking',
        message: 'A governed context asset requires an accountable owner.',
      });
    }
    if (
      asset.sourceResourceIds.length === 0 &&
      !['authoritative', 'governed'].includes(asset.authority)
    ) {
      issues.push({
        code: 'missing-provenance',
        severity: 'blocking',
        message:
          'Observed, expert or inferred context requires at least one source Resource.',
      });
    }
    if (!specificationIsComplete(asset)) {
      issues.push({
        code: 'invalid-specification',
        severity: 'blocking',
        message: `The ${asset.kind} specification is incomplete or invalid.`,
      });
    }
    if (now < validFrom || (validTo !== null && now >= validTo)) {
      issues.push({
        code: 'outside-validity-window',
        severity: 'blocking',
        message: 'The asset is outside its declared validity window.',
      });
    }
    if (nextReview !== null && now >= nextReview) {
      issues.push({
        code: 'stale-certification',
        severity: asset.lifecycle === 'certified' ? 'blocking' : 'warning',
        message: 'The asset has passed its next required review date.',
      });
    }
    if (unresolvedDependencies.length > 0) {
      issues.push({
        code: 'unresolved-dependency',
        severity: 'blocking',
        message: `${unresolvedDependencies.length} declared dependency is not available in this context portfolio.`,
      });
    }
    if ((currentVersions.get(asset.stableKey) ?? 0) > 1) {
      issues.push({
        code: 'competing-current-version',
        severity: 'blocking',
        message:
          'More than one candidate or certified version uses this stable key.',
      });
    }

    const dimensions = {
      ownership: asset.ownerActorId ? 1 : 0,
      provenance:
        asset.sourceResourceIds.length > 0 ||
        ['authoritative', 'governed'].includes(asset.authority)
          ? 1
          : 0,
      freshness:
        nextReview === null ? 0.75 : now < nextReview ? 1 : 0,
      confidence: asset.confidence,
      completeness: specificationIsComplete(asset) ? 1 : 0,
      dependencyIntegrity: unresolvedDependencies.length === 0 ? 1 : 0,
      versionIntegrity: (currentVersions.get(asset.stableKey) ?? 0) <= 1 ? 1 : 0,
    };
    const score = round(
      dimensions.ownership * 0.15 +
        dimensions.provenance * 0.2 +
        dimensions.freshness * 0.15 +
        dimensions.confidence * 0.1 +
        dimensions.completeness * 0.2 +
        dimensions.dependencyIntegrity * 0.1 +
        dimensions.versionIntegrity * 0.1,
    );
    const status = issues.some((issue) => issue.severity === 'blocking')
      ? 'blocked'
      : issues.length > 0 || score < 0.8
        ? 'attention'
        : 'ready';

    return {
      resourceId: asset.resourceId,
      evaluatorVersion: 'context-quality-v1',
      status,
      score,
      dimensions,
      issues,
      assessedAt: assessedAt.toISOString(),
    };
  });
}
