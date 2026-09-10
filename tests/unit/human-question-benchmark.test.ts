import { describe, expect, it } from 'vitest';
import {
  addHumanAuthoredQuestions,
  createHumanQuestionAuthoringPacket,
  validateHumanQuestionAuthoringPacket,
} from '@/src/modules/benchmarks/human-question-benchmark';
import {
  generateScaleCorpus,
  validateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';

function completedPacket() {
  const corpus = generateScaleCorpus();
  const packet = createHumanQuestionAuthoringPacket(corpus);
  packet.authorship = {
    author: 'Independent evaluator',
    authoredAt: '2026-09-09T08:00:00.000Z',
    independentlyAuthored: true,
  };
  packet.questions = packet.questions.map((item, index) => ({
    ...item,
    question: `What issues are affecting ${item.clientContext} in customer scenario ${index + 1}?`,
  }));
  return { corpus, packet };
}

describe('human benchmark questions', () => {
  it('creates a blind authoring packet without scorer answer sets or project labels', () => {
    const corpus = generateScaleCorpus();
    const packet = createHumanQuestionAuthoringPacket(corpus);
    const serialized = JSON.stringify(packet);
    expect(packet.questions).toHaveLength(25);
    expect(serialized).not.toContain('expectedRecordIds');
    expect(serialized).not.toContain('forbiddenRecordIds');
    for (const item of packet.questions) {
      const record = corpus.records.find(
        (candidate) => candidate.canonicalProjectId === item.projectKey,
      )!;
      expect(item.question).toBe('');
      expect(item.scenario).not.toContain(record.canonicalProjectName);
      expect(item.avoidTerms).toContain(
        record.canonicalProjectName.split(' ').at(-1)!.toLowerCase(),
      );
    }
  });

  it('validates authorship and adds actor-specific human questions deterministically', () => {
    const { corpus, packet } = completedPacket();
    expect(validateHumanQuestionAuthoringPacket(corpus, packet)).toEqual([]);
    const enriched = addHumanAuthoredQuestions(corpus, packet);
    expect(validateScaleCorpus(enriched)).toEqual([]);
    expect(
      enriched.questions.filter((question) => question.cohort === 'human-authored'),
    ).toHaveLength(75);
    expect(addHumanAuthoredQuestions(enriched, packet)).toEqual(enriched);

    const human = enriched.questions.find(
      (question) => question.cohort === 'human-authored',
    )!;
    const exact = enriched.questions.find(
      (question) =>
        question.cohort === 'exact-name' &&
        question.actor === human.actor &&
        question.canonicalProjectId === human.canonicalProjectId,
    )!;
    expect(human.expectedRecordIds).toEqual(exact.expectedRecordIds);
    expect(human.forbiddenRecordIds).toEqual(exact.forbiddenRecordIds);
  });

  it('rejects incomplete, duplicated and label-leaking submissions', () => {
    const { corpus, packet } = completedPacket();
    packet.authorship.independentlyAuthored = false;
    packet.questions[0]!.question = 'Why is onboarding difficult?';
    packet.questions[1]!.projectKey = packet.questions[0]!.projectKey;
    const errors = validateHumanQuestionAuthoringPacket(corpus, packet);
    expect(errors).toContain('authorship.independentlyAuthored must be true');
    expect(errors.some((error) => error.includes('prohibited term'))).toBe(true);
    expect(errors.some((error) => error.includes('duplicated'))).toBe(true);
    expect(errors.some((error) => error.includes('missing'))).toBe(true);
  });
});
