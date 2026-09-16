import { createHash } from 'node:crypto';
import type { MemoryType } from './isolation-policy';

export interface FormationArtifact {
  resourceId: string;
  sourceType: 'file' | 'conversation' | 'meeting' | 'research' | 'debrief';
  title: string;
  body: string;
}

export interface FormedMemoryCandidate {
  memoryType: Exclude<MemoryType, 'person-preference'>;
  statement: string;
  statementHash: string;
  rationale: string;
  confidence: number;
  qualityScore: number;
  evidenceResourceIds: string[];
  context: {
    detector: string;
    sourceType: FormationArtifact['sourceType'];
    sourceTitle: string;
    prediction: string;
    falsificationCondition: string;
  };
}

const detectors: Array<{
  id: string;
  type: FormedMemoryCandidate['memoryType'];
  pattern: RegExp;
  prediction: string;
  falsificationCondition: string;
}> = [
  {
    id: 'explicit-decision',
    type: 'decision',
    pattern: /\b(agreed|decided|chose|adopted|assigned|committed)\b/i,
    prediction:
      'Later project activity should remain consistent with this decision.',
    falsificationCondition:
      'A later attributable decision explicitly reverses it.',
  },
  {
    id: 'constraint-adaptation',
    type: 'constraint-adaptation',
    pattern:
      /\b(constraint|limited|unavailable|could not|instead|adapted|workaround)\b/i,
    prediction:
      'The adaptation should remain useful while the same constraint holds.',
    falsificationCondition:
      'The adaptation stops helping when compared with an available alternative.',
  },
  {
    id: 'risk-response',
    type: 'risk-response',
    pattern: /\b(risk|delay|blocked|failure|failed|mitigat|reduce|avoid)\b/i,
    prediction:
      'Applying the response should reduce the described delivery risk.',
    falsificationCondition:
      'The risk occurs at the same rate after the response is applied.',
  },
  {
    id: 'anti-pattern',
    type: 'anti-pattern',
    pattern:
      /\b(rework|too late|missed|duplicate|repeated|did not work|abandon)\b/i,
    prediction:
      'Avoiding this pattern should reduce repeated effort or failure.',
    falsificationCondition:
      'Projects avoiding the pattern show no improvement in the relevant outcome.',
  },
  {
    id: 'approach-pattern',
    type: 'approach-pattern',
    pattern:
      /\b(research|interview|workshop|prototype|test|synthesis|mapped|separate|iteration)\b/i,
    prediction:
      'Repeating the approach in comparable conditions should improve the target outcome.',
    falsificationCondition:
      'Comparable projects using the approach do not reproduce the benefit.',
  },
];

function sentences(value: string) {
  return value
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 500);
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function formProjectMemoryCandidates(
  artifacts: FormationArtifact[],
  limit = 4,
): FormedMemoryCandidate[] {
  const candidates = artifacts.flatMap((artifact) =>
    sentences(artifact.body).flatMap((statement) => {
      const detector = detectors.find((item) => item.pattern.test(statement));
      if (!detector) return [];
      const evidenceSpecificity = /\b\d+\b/.test(statement) ? 0.06 : 0;
      const decisionSpecificity = detector.type === 'decision' ? 0.05 : 0;
      return [
        {
          memoryType: detector.type,
          statement,
          statementHash: digest(statement.toLowerCase()),
          rationale: `The ${detector.id.replaceAll('-', ' ')} rule found a material, attributable signal in ${artifact.sourceType} “${artifact.title}”. It remains a candidate until review.`,
          confidence: Math.min(
            0.86,
            Math.round(
              (0.67 + evidenceSpecificity + decisionSpecificity) * 100,
            ) / 100,
          ),
          qualityScore: Math.min(
            0.9,
            Math.round(
              (0.7 + evidenceSpecificity + decisionSpecificity) * 100,
            ) / 100,
          ),
          evidenceResourceIds: [artifact.resourceId],
          context: {
            detector: detector.id,
            sourceType: artifact.sourceType,
            sourceTitle: artifact.title,
            prediction: detector.prediction,
            falsificationCondition: detector.falsificationCondition,
          },
        } satisfies FormedMemoryCandidate,
      ];
    }),
  );
  const unique = new Map<string, FormedMemoryCandidate>();
  for (const candidate of candidates) {
    const current = unique.get(candidate.statementHash);
    if (!current || candidate.confidence > current.confidence) {
      unique.set(candidate.statementHash, candidate);
    }
  }
  return [...unique.values()]
    .sort(
      (left, right) =>
        right.qualityScore - left.qualityScore ||
        left.statement.localeCompare(right.statement),
    )
    .slice(0, Math.max(0, limit));
}

export function formationInputDigest(artifacts: FormationArtifact[]) {
  return digest(
    JSON.stringify(
      artifacts
        .map((artifact) => ({
          id: artifact.resourceId,
          type: artifact.sourceType,
          bodyHash: digest(artifact.body),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
  );
}
