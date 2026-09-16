import { describe, expect, it } from 'vitest';
import {
  CONTEXT_FOUNDATION_IDS,
  onboardingContextFoundation,
} from '@/src/modules/context-assets/foundation';
import { assessContextPortfolio } from '@/src/modules/context-assets/quality';
import type { ContextAsset } from '@/src/modules/context-assets/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const SOURCE_ID = '10000000-0000-4000-8000-000000000001';

describe('context asset quality pipeline', () => {
  it('certifies the governed onboarding term, metric and diagnostic skill', () => {
    const foundation = onboardingContextFoundation([SOURCE_ID], NOW);
    const assessments = assessContextPortfolio(
      foundation.assets,
      foundation.dependencies,
      NOW,
    );

    expect(assessments).toHaveLength(3);
    expect(assessments.every((assessment) => assessment.status === 'ready')).toBe(
      true,
    );
    expect(
      assessments.find(
        (assessment) =>
          assessment.resourceId === CONTEXT_FOUNDATION_IDS.abandonmentMetric,
      )?.score,
    ).toBeGreaterThan(0.95);
  });

  it('blocks a metric that has no owner and incomplete calculation semantics', () => {
    const foundation = onboardingContextFoundation([SOURCE_ID], NOW);
    const metric = foundation.assets.find(
      (asset) => asset.kind === 'metric',
    ) as ContextAsset;
    const invalidMetric: ContextAsset = {
      ...metric,
      ownerActorId: null,
      specification: { measure: 'Started journeys' },
    };
    const assets = foundation.assets.map((asset) =>
      asset.resourceId === metric.resourceId ? invalidMetric : asset,
    );
    const assessment = assessContextPortfolio(
      assets,
      foundation.dependencies,
      NOW,
    ).find((item) => item.resourceId === metric.resourceId);

    expect(assessment?.status).toBe('blocked');
    expect(assessment?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing-owner', 'invalid-specification']),
    );
  });

  it('blocks stale certification, unresolved dependencies and competing current versions', () => {
    const foundation = onboardingContextFoundation([SOURCE_ID], NOW);
    const staleTerm: ContextAsset = {
      ...foundation.assets[0],
      nextReviewAt: '2026-09-14T12:00:00.000Z',
    };
    const competingTerm: ContextAsset = {
      ...staleTerm,
      resourceId: '10000000-0000-4000-8000-000000000002',
      version: 2,
    };
    const dependencies = [
      ...foundation.dependencies,
      {
        fromResourceId: staleTerm.resourceId,
        toResourceId: '10000000-0000-4000-8000-000000000099',
        type: 'depends-on' as const,
        rationale: 'This intentionally missing asset proves fail-closed quality.',
      },
    ];
    const assessments = assessContextPortfolio(
      [staleTerm, competingTerm, ...foundation.assets.slice(1)],
      dependencies,
      NOW,
    );
    const termAssessment = assessments.find(
      (assessment) => assessment.resourceId === staleTerm.resourceId,
    );

    expect(termAssessment?.status).toBe('blocked');
    expect(termAssessment?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'stale-certification',
        'unresolved-dependency',
        'competing-current-version',
      ]),
    );
  });
});
