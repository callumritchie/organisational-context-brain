import { describe, expect, it } from 'vitest';
import {
  aggregateHypothesisReviewerScores,
  createBlindHypothesisReviewPacket,
  evaluateHypothesisQualityMachineContract,
  generateHypothesisQualityCases,
  validateHypothesisReviewerScores,
  validateIndependentHypothesisCasePacket,
  type HypothesisReviewerScores,
  type IndependentHypothesisCasePacket,
} from '@/src/modules/benchmarks/hypothesis-quality-evaluation';

function reviewerScores(
  packet: ReturnType<typeof createBlindHypothesisReviewPacket>,
  name: string,
  grounding: number,
): HypothesisReviewerScores {
  return {
    schemaVersion: 1,
    reviewer: {
      name,
      reviewedAt: '2026-09-14T12:00:00.000Z',
      independentReview: true,
      didNotSeeExpectedLabels: true,
    },
    reviews: packet.cases.map((item) => ({
      blindCaseId: item.blindCaseId,
      grounding: item.candidate ? grounding : null,
      novelty: item.candidate ? grounding : null,
      usefulness: item.candidate ? grounding : null,
      falsifiability: item.candidate ? grounding : null,
      contradictionHandling: item.candidate ? grounding : null,
      actionability: item.candidate ? grounding : null,
      unsupportedCandidate: false,
      missedMaterialPattern: false,
      notes: '',
    })),
  };
}

describe('hypothesis quality evaluation', () => {
  it('measures positives, contradiction-rich cases and negative controls without hiding the current contradiction gap', () => {
    const result = evaluateHypothesisQualityMachineContract(
      generateHypothesisQualityCases(100),
    );
    expect(result).toMatchObject({
      casesEvaluated: 100,
      expectedCandidateCount: 80,
      negativeControlCount: 20,
      truePositives: 80,
      trueNegatives: 20,
      falsePositives: 0,
      falseNegatives: 0,
      groundedCandidates: 80,
      contradictionCases: 20,
      contradictionsSurfaced: 0,
      contradictionSurfacingRate: 0,
      safetyContractPassed: true,
      qualityGateStatus: 'pending-independent-review',
      externalTokens: 0,
    });
  });

  it('removes expected labels from the blind review packet', () => {
    const packet = createBlindHypothesisReviewPacket(
      generateHypothesisQualityCases(20),
    );
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toContain('expectedBehavior');
    expect(serialized).not.toContain('expectedConceptIds');
    expect(new Set(packet.cases.map((item) => item.blindCaseId)).size).toBe(20);
  });

  it('rejects stance-labelled submissions even with valid independent authorship', () => {
    const cases = generateHypothesisQualityCases(20);
    const packet: IndependentHypothesisCasePacket = {
      schemaVersion: 1,
      instructions: [],
      authorship: {
        author: 'Independent evaluator',
        authoredAt: '2026-09-14T12:00:00.000Z',
        independentlyAuthored: true,
        didNotInspectImplementation: true,
      },
      cases: cases.map((item) => ({
        ...item,
        adjudicationNotes: 'Independently adjudicated.',
      })),
    };
    packet.cases[0]!.documents[0]!.body =
      'This hypothesis supports a prepared answer rather than natural evidence.';
    expect(validateIndependentHypothesisCasePacket(packet)).toContain(
      'cases[0].documents[0] contains a prohibited stance label',
    );
  });

  it('validates complete reviewers and calculates agreement and calibration', () => {
    const packet = createBlindHypothesisReviewPacket(
      generateHypothesisQualityCases(20),
    );
    const first = reviewerScores(packet, 'Reviewer one', 5);
    const second = reviewerScores(packet, 'Reviewer two', 4);
    expect(validateHypothesisReviewerScores(packet, first)).toEqual([]);
    const result = aggregateHypothesisReviewerScores(packet, [first, second]);
    expect(result).toMatchObject({
      reviewers: 2,
      cases: 20,
      reviewerAgreementWithinOne: 1,
      unsupportedCandidateRate: 0,
      missedMaterialPatternRate: 0,
      provisionalGate: true,
    });
    expect(result.confidenceCalibrationMae).toBeCloseTo(0, 10);
  });
});
