import { stableId } from '@/src/modules/canonical/stable-id';
import type {
  BenchmarkQuestion,
  BenchmarkRecord,
  ScaleCorpus,
} from './scale-corpus';

export interface HumanQuestionAuthoringEntry {
  projectKey: string;
  clientContext: string;
  scenario: string;
  avoidTerms: string[];
  question: string;
}

export interface HumanQuestionAuthoringPacket {
  schemaVersion: 1;
  corpusSeed: number;
  instructions: string[];
  authorship: {
    author: string;
    authoredAt: string;
    independentlyAuthored: boolean;
  };
  questions: HumanQuestionAuthoringEntry[];
}

function projectScenario(record: BenchmarkRecord) {
  if (record.canonicalProjectName.endsWith(' Onboarding')) {
    return 'Customers trying to open a new account.';
  }
  if (record.canonicalProjectName.endsWith(' Renewal')) {
    return 'Existing customers deciding whether and how to continue their service.';
  }
  if (record.canonicalProjectName.endsWith(' Migration')) {
    return 'Customers moving from an existing service to its replacement platform.';
  }
  if (record.canonicalProjectName.endsWith(' Discovery')) {
    return 'Early research into customer needs before a solution is defined.';
  }
  throw new Error(`No authoring scenario exists for ${record.canonicalProjectName}`);
}

function exactQuestions(corpus: ScaleCorpus) {
  return corpus.questions.filter((question) => question.cohort === 'exact-name');
}

function projectRecordsForQuestions(corpus: ScaleCorpus) {
  const projectIds = new Set(
    exactQuestions(corpus).map((question) => question.canonicalProjectId),
  );
  const records = new Map<string, BenchmarkRecord>();
  for (const record of corpus.records) {
    if (projectIds.has(record.canonicalProjectId) && !records.has(record.canonicalProjectId)) {
      records.set(record.canonicalProjectId, record);
    }
  }
  return records;
}

export function createHumanQuestionAuthoringPacket(
  corpus: ScaleCorpus,
): HumanQuestionAuthoringPacket {
  const records = projectRecordsForQuestions(corpus);
  return {
    schemaVersion: 1,
    corpusSeed: corpus.seed,
    instructions: [
      'Write one natural question for each scenario as a real colleague might ask it.',
      'Do not use any avoidTerms, inspect the benchmark corpus, or view scorer answer sets.',
      'Implicit references and organisation-specific vocabulary are encouraged.',
      'Complete the authorship fields and set independentlyAuthored to true only when accurate.',
    ],
    authorship: {
      author: '',
      authoredAt: '',
      independentlyAuthored: false,
    },
    questions: [...records.values()].map((record) => ({
      projectKey: record.canonicalProjectId,
      clientContext: record.canonicalClientName,
      scenario: projectScenario(record),
      avoidTerms: [record.canonicalProjectName.split(' ').at(-1)!.toLowerCase()],
      question: '',
    })),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateHumanQuestionAuthoringPacket(
  corpus: ScaleCorpus,
  packet: unknown,
) {
  const errors: string[] = [];
  if (!isObject(packet)) return ['Authoring packet must be a JSON object'];
  if (packet.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (packet.corpusSeed !== corpus.seed) {
    errors.push(`corpusSeed must match ${corpus.seed}`);
  }
  const authorship = packet.authorship;
  if (!isObject(authorship)) {
    errors.push('authorship must be an object');
  } else {
    if (typeof authorship.author !== 'string' || !authorship.author.trim()) {
      errors.push('authorship.author is required');
    }
    if (
      typeof authorship.authoredAt !== 'string' ||
      !authorship.authoredAt ||
      Number.isNaN(Date.parse(authorship.authoredAt))
    ) {
      errors.push('authorship.authoredAt must be a valid date');
    }
    if (authorship.independentlyAuthored !== true) {
      errors.push('authorship.independentlyAuthored must be true');
    }
  }
  if (!Array.isArray(packet.questions)) {
    return [...errors, 'questions must be an array'];
  }

  const records = projectRecordsForQuestions(corpus);
  const expectedKeys = new Set(records.keys());
  const seenKeys = new Set<string>();
  const seenQueries = new Set<string>();
  for (const [index, item] of packet.questions.entries()) {
    if (!isObject(item)) {
      errors.push(`questions[${index}] must be an object`);
      continue;
    }
    if (typeof item.projectKey !== 'string' || !expectedKeys.has(item.projectKey)) {
      errors.push(`questions[${index}].projectKey is unknown`);
      continue;
    }
    if (seenKeys.has(item.projectKey)) {
      errors.push(`questions[${index}].projectKey is duplicated`);
    }
    seenKeys.add(item.projectKey);
    const query = typeof item.question === 'string' ? item.question.trim() : '';
    if (query.length < 12 || query.length > 300) {
      errors.push(`questions[${index}].question must contain 12 to 300 characters`);
      continue;
    }
    const normalizedQuery = query.toLowerCase();
    if (seenQueries.has(normalizedQuery)) {
      errors.push(`questions[${index}].question is duplicated`);
    }
    seenQueries.add(normalizedQuery);
    const projectTerm = records
      .get(item.projectKey)!
      .canonicalProjectName.split(' ')
      .at(-1)!
      .toLowerCase();
    if (new RegExp(`\\b${projectTerm}\\b`, 'i').test(query)) {
      errors.push(`questions[${index}].question contains prohibited term “${projectTerm}”`);
    }
  }
  for (const key of expectedKeys) {
    if (!seenKeys.has(key)) errors.push(`A question is missing for projectKey ${key}`);
  }
  if (packet.questions.length !== expectedKeys.size) {
    errors.push(`questions must contain exactly ${expectedKeys.size} entries`);
  }
  return errors;
}

export function addHumanAuthoredQuestions(
  corpus: ScaleCorpus,
  packet: unknown,
): ScaleCorpus {
  const errors = validateHumanQuestionAuthoringPacket(corpus, packet);
  if (errors.length) {
    throw new Error(`Human question validation failed:\n${errors.join('\n')}`);
  }
  const validPacket = packet as HumanQuestionAuthoringPacket;
  const queryByProject = new Map(
    validPacket.questions.map((item) => [item.projectKey, item.question.trim()]),
  );
  const baseQuestions = corpus.questions.filter(
    (question) => question.cohort !== 'human-authored',
  );
  const humanQuestions: BenchmarkQuestion[] = exactQuestions(corpus).map(
    (question) => {
      const query = queryByProject.get(question.canonicalProjectId)!;
      return {
        ...question,
        id: stableId(
          'benchmark-question',
          `${question.canonicalProjectId}:${question.actor}:human-authored:${query}`,
        ),
        cohort: 'human-authored',
        query,
        lexicalQuery: query,
        expectedRecordIds: [...question.expectedRecordIds],
        forbiddenRecordIds: [...question.forbiddenRecordIds],
      };
    },
  );
  return { ...corpus, questions: [...baseQuestions, ...humanQuestions] };
}
