import { stableId } from '@/src/modules/canonical/stable-id';

export const BENCHMARK_SOURCE_SYSTEMS = [
  'research',
  'meetings',
  'crm',
  'documents',
  'messages',
] as const;
export const BENCHMARK_VISIBILITIES = [
  'everyone',
  'internal',
  'alex-only',
  'jamie-only',
] as const;

export type BenchmarkSourceSystem = (typeof BENCHMARK_SOURCE_SYSTEMS)[number];
export type BenchmarkVisibility = (typeof BENCHMARK_VISIBILITIES)[number];
export type BenchmarkStance = 'SUPPORTS' | 'CONTRADICTS';

export interface BenchmarkVersion {
  version: number;
  title: string;
  body: string;
  updatedAt: string;
  stance: BenchmarkStance;
  contentHashKey: string;
}

export interface BenchmarkRecord {
  id: string;
  sourceSystem: BenchmarkSourceSystem;
  externalId: string;
  sourceUri: string;
  canonicalClientId: string;
  canonicalClientName: string;
  canonicalProjectId: string;
  canonicalProjectName: string;
  sourceClientReference: string;
  sourceProjectReference: string;
  visibility: BenchmarkVisibility;
  versions: BenchmarkVersion[];
  duplicateOf: string | null;
  deleted: boolean;
  ambiguousAlias: boolean;
}

export interface BenchmarkQuestion {
  id: string;
  actor: 'alex' | 'jamie' | 'morgan';
  query: string;
  canonicalProjectId: string;
  expectedRecordIds: string[];
  forbiddenRecordIds: string[];
}

export interface ScaleCorpus {
  seed: number;
  records: BenchmarkRecord[];
  questions: BenchmarkQuestion[];
}

export interface ScaleCorpusOptions {
  recordCount?: number;
  clientCount?: number;
  projectsPerClient?: number;
  questionProjectCount?: number;
  seed?: number;
}

export interface ScaleUpdateBatch {
  corpus: ScaleCorpus;
  records: BenchmarkRecord[];
  revisions: number;
  deletions: number;
}

export interface ScaleUpdateOptions {
  updateCount?: number;
  deletionEvery?: number;
}

const CLIENT_WORDS = [
  'Aster',
  'Beacon',
  'Cedar',
  'Delta',
  'Elm',
  'Fjord',
  'Grove',
  'Harbour',
  'Ion',
  'Juniper',
  'Kite',
  'Lumen',
  'Morrow',
  'Nimbus',
  'Orchid',
  'Pioneer',
  'Quartz',
  'Rook',
  'Summit',
  'Tidal',
] as const;
const CLIENT_SUFFIXES = [
  'Bank',
  'Health',
  'Energy',
  'Retail',
  'Mobility',
] as const;
const PROJECT_WORDS = [
  'Onboarding',
  'Renewal',
  'Migration',
  'Discovery',
] as const;
const ISSUES = [
  'identity verification delay',
  'unclear eligibility guidance',
  'handoff between mobile and branch channels',
  'duplicate document requests',
  'accessibility failures in the application form',
  'slow manual compliance review',
  'pricing language that creates uncertainty',
  'account recovery loops',
] as const;

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function canRead(
  actor: BenchmarkQuestion['actor'],
  visibility: BenchmarkVisibility,
) {
  if (visibility === 'everyone') return true;
  if (visibility === 'internal') return actor !== 'morgan';
  return visibility === `${actor}-only`;
}

function clientName(index: number) {
  const word = CLIENT_WORDS[index % CLIENT_WORDS.length];
  const suffix =
    CLIENT_SUFFIXES[
      Math.floor(index / CLIENT_WORDS.length) % CLIENT_SUFFIXES.length
    ];
  return `${word} ${suffix}`;
}

function sourceReference(
  system: BenchmarkSourceSystem,
  name: string,
  index: number,
  ambiguous: boolean,
) {
  if (ambiguous) return `shared-${index % 7}`;
  const slug = normalize(name);
  if (system === 'crm') return `account-${10_000 + index}`;
  if (system === 'documents') return `/clients/${slug}`;
  if (system === 'messages') return `channel-${slug}`;
  if (system === 'meetings') return `${name.replaceAll(' ', '')}-${index}`;
  return slug;
}

function buildVersion(input: {
  recordIndex: number;
  version: number;
  sourceSystem: BenchmarkSourceSystem;
  clientName: string;
  projectName: string;
  issue: string;
  duplicateMarker: string | null;
  changedStance: boolean;
}): BenchmarkVersion {
  const stance: BenchmarkStance =
    input.changedStance && input.version > 1 ? 'CONTRADICTS' : 'SUPPORTS';
  const date = new Date(
    Date.UTC(2025, 0, 1 + ((input.recordIndex * 3 + input.version * 17) % 600)),
  );
  const sourceLanguage = {
    research: 'The moderated study observed',
    meetings: 'The delivery meeting recorded',
    crm: 'The account team reported',
    documents: 'The working document states',
    messages: 'The project channel discussed',
  }[input.sourceSystem];
  const revision =
    input.version === 1
      ? 'This was the initial interpretation.'
      : `Revision ${input.version} supersedes the earlier interpretation after additional evidence.`;
  const conclusion =
    stance === 'SUPPORTS'
      ? `${input.issue} is contributing to abandonment.`
      : `${input.issue} is not a primary cause; the earlier claim is contradicted.`;
  const duplicate = input.duplicateMarker
    ? ` Shared duplicate marker: ${input.duplicateMarker}.`
    : '';
  const longDocumentSections =
    input.recordIndex % 31 === 0
      ? Array.from(
          { length: 18 },
          (_, section) =>
            `Section ${section + 1} preserves interview, operational and delivery context for later comparison. ` +
            `The source uses inconsistent terminology while still referring to ${input.clientName} and ${input.projectName}.`,
        ).join('\n\n')
      : '';
  const body =
    `${sourceLanguage} that ${conclusion} ${revision} Client: ${input.clientName}. Project: ${input.projectName}.${duplicate}` +
    (longDocumentSections ? `\n\n${longDocumentSections}` : '');
  return {
    version: input.version,
    title: `${input.projectName}: ${input.issue} (v${input.version})`,
    body,
    updatedAt: date.toISOString(),
    stance,
    contentHashKey: stableId('benchmark-content', body),
  };
}

export function generateScaleCorpus(
  options: ScaleCorpusOptions = {},
): ScaleCorpus {
  const recordCount = options.recordCount ?? 10_000;
  const clientCount = options.clientCount ?? 50;
  const projectsPerClient = options.projectsPerClient ?? 4;
  const questionProjectCount = options.questionProjectCount ?? 25;
  const seed = options.seed ?? 20_260_908;
  if (!Number.isInteger(recordCount) || recordCount < 100)
    throw new Error('recordCount must be an integer of at least 100');
  if (!Number.isInteger(clientCount) || clientCount < 2)
    throw new Error('clientCount must be an integer of at least 2');
  if (!Number.isInteger(projectsPerClient) || projectsPerClient < 1)
    throw new Error('projectsPerClient must be a positive integer');

  const random = createRandom(seed);
  const projectCount = clientCount * projectsPerClient;
  const records: BenchmarkRecord[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const projectIndex = index % projectCount;
    const projectCycle = Math.floor(index / projectCount);
    const sourceSystem =
      BENCHMARK_SOURCE_SYSTEMS[
        (projectIndex + projectCycle) % BENCHMARK_SOURCE_SYSTEMS.length
      ];
    const clientIndex = Math.floor(projectIndex / projectsPerClient);
    const projectOrdinal = projectIndex % projectsPerClient;
    const canonicalClientName = clientName(clientIndex);
    const canonicalProjectName = `${canonicalClientName} ${PROJECT_WORDS[projectOrdinal % PROJECT_WORDS.length]}`;
    const canonicalClientId = stableId('benchmark-client', canonicalClientName);
    const canonicalProjectId = stableId(
      'benchmark-project',
      canonicalProjectName,
    );
    const id = stableId('benchmark-record', `${seed}:${index}`);
    const visibility =
      BENCHMARK_VISIBILITIES[
        (projectIndex + projectCycle) % BENCHMARK_VISIBILITIES.length
      ];
    const ambiguousAlias = index % 37 === 0;
    const versionCount = index % 19 === 0 ? 3 : index % 7 === 0 ? 2 : 1;
    const changedStance = index % 23 === 0;
    const duplicateOf =
      index >= 11 && index % 11 === 0 ? records[index - 11]!.id : null;
    const duplicateMarker = duplicateOf
      ? `duplicate-group-${Math.floor(index / 11)}`
      : null;
    const issue = ISSUES[Math.floor(random() * ISSUES.length)]!;
    const versions = Array.from({ length: versionCount }, (_, versionIndex) =>
      buildVersion({
        recordIndex: index,
        version: versionIndex + 1,
        sourceSystem,
        clientName: canonicalClientName,
        projectName: canonicalProjectName,
        issue,
        duplicateMarker,
        changedStance,
      }),
    );
    records.push({
      id,
      sourceSystem,
      externalId: `${sourceSystem}-${seed}-${index}`,
      sourceUri: `${sourceSystem}://benchmark/${seed}/${index}`,
      canonicalClientId,
      canonicalClientName,
      canonicalProjectId,
      canonicalProjectName,
      sourceClientReference: sourceReference(
        sourceSystem,
        canonicalClientName,
        clientIndex,
        ambiguousAlias,
      ),
      sourceProjectReference: sourceReference(
        sourceSystem,
        canonicalProjectName,
        projectIndex,
        ambiguousAlias,
      ),
      visibility,
      versions,
      duplicateOf,
      deleted: index % 41 === 0,
      ambiguousAlias,
    });
  }

  const actors: BenchmarkQuestion['actor'][] = ['alex', 'jamie', 'morgan'];
  const selectedProjects = [
    ...new Set(records.map((record) => record.canonicalProjectId)),
  ].slice(0, Math.min(questionProjectCount, projectCount));
  const questions = selectedProjects.flatMap(
    (canonicalProjectId) =>
      actors.map((actor) => {
        const projectRecords = records.filter(
          (record) =>
            record.canonicalProjectId === canonicalProjectId && !record.deleted,
        );
        const projectName = projectRecords[0]!.canonicalProjectName;
        return {
          id: stableId('benchmark-question', `${canonicalProjectId}:${actor}`),
          actor,
          query: `What is preventing customers from completing ${projectName}?`,
          canonicalProjectId,
          expectedRecordIds: projectRecords
            .filter((record) => canRead(actor, record.visibility))
            .map((record) => record.id),
          forbiddenRecordIds: projectRecords
            .filter((record) => !canRead(actor, record.visibility))
            .map((record) => record.id),
        };
      }),
  );

  return { seed, records, questions };
}

export function summarizeScaleCorpus(corpus: ScaleCorpus) {
  const count = (predicate: (record: BenchmarkRecord) => boolean) =>
    corpus.records.filter(predicate).length;
  return {
    seed: corpus.seed,
    logicalRecords: corpus.records.length,
    immutableVersions: corpus.records.reduce(
      (sum, record) => sum + record.versions.length,
      0,
    ),
    clients: new Set(corpus.records.map((record) => record.canonicalClientId))
      .size,
    projects: new Set(corpus.records.map((record) => record.canonicalProjectId))
      .size,
    sourceSystems: Object.fromEntries(
      BENCHMARK_SOURCE_SYSTEMS.map((system) => [
        system,
        count((record) => record.sourceSystem === system),
      ]),
    ),
    visibilityScopes: Object.fromEntries(
      BENCHMARK_VISIBILITIES.map((visibility) => [
        visibility,
        count((record) => record.visibility === visibility),
      ]),
    ),
    multiVersionRecords: count((record) => record.versions.length > 1),
    stanceChanges: count(
      (record) => record.versions.at(-1)!.stance !== record.versions[0]!.stance,
    ),
    duplicates: count((record) => record.duplicateOf !== null),
    deleted: count((record) => record.deleted),
    ambiguousAliases: count((record) => record.ambiguousAlias),
    longDocuments: count(
      (record) => record.versions.at(-1)!.body.length > 1_600,
    ),
    evaluationQuestions: corpus.questions.length,
    forbiddenEvidenceChecks: corpus.questions.reduce(
      (sum, question) => sum + question.forbiddenRecordIds.length,
      0,
    ),
  };
}

export function generateScaleUpdateBatch(
  corpus: ScaleCorpus,
  options: ScaleUpdateOptions = {},
): ScaleUpdateBatch {
  const eligible = corpus.records.filter((record) => !record.deleted);
  const updateCount = options.updateCount ?? Math.min(500, eligible.length);
  const deletionEvery = options.deletionEvery ?? 10;
  if (!Number.isInteger(updateCount) || updateCount < 1 || updateCount > eligible.length) {
    throw new Error(`updateCount must be an integer between 1 and ${eligible.length}`);
  }
  if (!Number.isInteger(deletionEvery) || deletionEvery < 2) {
    throw new Error('deletionEvery must be an integer of at least 2');
  }

  let revisions = 0;
  let deletions = 0;
  const records = eligible.slice(0, updateCount).map((record, index) => {
    if (index % deletionEvery === 0) {
      deletions += 1;
      return { ...record, deleted: true };
    }

    revisions += 1;
    const latest = record.versions.at(-1)!;
    const version = latest.version + 1;
    const body = `${latest.body}\n\nIncremental benchmark revision ${version} confirms the current interpretation for ${record.canonicalProjectName}.`;
    return {
      ...record,
      versions: [
        ...record.versions,
        {
          version,
          title: `${record.canonicalProjectName}: incremental evidence refresh (v${version})`,
          body,
          updatedAt: new Date(Date.parse(latest.updatedAt) + 31_536_000_000).toISOString(),
          stance: latest.stance,
          contentHashKey: stableId('benchmark-content', body),
        },
      ],
    };
  });
  const updates = new Map(records.map((record) => [record.id, record]));
  const updatedRecords = corpus.records.map((record) => updates.get(record.id) ?? record);
  const questions = corpus.questions.map((question) => {
    const projectRecords = updatedRecords.filter(
      (record) => record.canonicalProjectId === question.canonicalProjectId && !record.deleted,
    );
    return {
      ...question,
      expectedRecordIds: projectRecords
        .filter((record) => canRead(question.actor, record.visibility))
        .map((record) => record.id),
      forbiddenRecordIds: projectRecords
        .filter((record) => !canRead(question.actor, record.visibility))
        .map((record) => record.id),
    };
  });

  return {
    corpus: { ...corpus, records: updatedRecords, questions },
    records,
    revisions,
    deletions,
  };
}

export function validateScaleCorpus(corpus: ScaleCorpus) {
  const ids = new Set(corpus.records.map((record) => record.id));
  const errors: string[] = [];
  if (ids.size !== corpus.records.length)
    errors.push('Record IDs are not unique');
  for (const record of corpus.records) {
    if (!record.versions.length) errors.push(`${record.id} has no versions`);
    if (record.duplicateOf && !ids.has(record.duplicateOf))
      errors.push(`${record.id} has an unknown duplicate target`);
    if (record.versions.some((version, index) => version.version !== index + 1))
      errors.push(`${record.id} has a version gap`);
  }
  for (const question of corpus.questions) {
    if (
      question.expectedRecordIds.some((id) =>
        question.forbiddenRecordIds.includes(id),
      )
    ) {
      errors.push(
        `${question.id} contains evidence that is both expected and forbidden`,
      );
    }
    if (
      [...question.expectedRecordIds, ...question.forbiddenRecordIds].some(
        (id) => !ids.has(id),
      )
    ) {
      errors.push(`${question.id} refers to an unknown record`);
    }
  }
  return errors;
}
