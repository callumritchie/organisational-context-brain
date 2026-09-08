import { describe, expect, it } from 'vitest';
import {
  generateScaleCorpus,
  summarizeScaleCorpus,
  validateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';

describe('scale corpus', () => {
  it('is deterministic and contains known organisational-data failure modes', () => {
    const left = generateScaleCorpus({ recordCount: 1_000, seed: 42 });
    const right = generateScaleCorpus({ recordCount: 1_000, seed: 42 });
    expect(left).toEqual(right);
    expect(validateScaleCorpus(left)).toEqual([]);

    const summary = summarizeScaleCorpus(left);
    expect(summary.logicalRecords).toBe(1_000);
    expect(summary.clients).toBe(50);
    expect(summary.projects).toBe(200);
    expect(summary.immutableVersions).toBeGreaterThan(1_000);
    expect(summary.multiVersionRecords).toBeGreaterThan(100);
    expect(summary.stanceChanges).toBeGreaterThan(0);
    expect(summary.duplicates).toBeGreaterThan(0);
    expect(summary.deleted).toBeGreaterThan(0);
    expect(summary.ambiguousAliases).toBeGreaterThan(0);
    expect(summary.longDocuments).toBeGreaterThan(0);
    expect(Object.values(summary.sourceSystems)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(Object.values(summary.visibilityScopes)).toEqual([
      250, 250, 250, 250,
    ]);
  });

  it('provides actor-specific expected and forbidden evidence sets', () => {
    const corpus = generateScaleCorpus({
      recordCount: 1_000,
      questionProjectCount: 5,
      seed: 7,
    });
    expect(corpus.questions).toHaveLength(15);
    const projectQuestions = corpus.questions.slice(0, 3);
    const alex = projectQuestions.find(
      (question) => question.actor === 'alex',
    )!;
    const jamie = projectQuestions.find(
      (question) => question.actor === 'jamie',
    )!;
    const morgan = projectQuestions.find(
      (question) => question.actor === 'morgan',
    )!;
    expect(alex.forbiddenRecordIds.length).toBeGreaterThan(0);
    expect(jamie.forbiddenRecordIds.length).toBeGreaterThan(0);
    expect(morgan.expectedRecordIds.length).toBeLessThan(
      alex.expectedRecordIds.length,
    );
    expect(morgan.expectedRecordIds.length).toBeLessThan(
      jamie.expectedRecordIds.length,
    );
  });
});
