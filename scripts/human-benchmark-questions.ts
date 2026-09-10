import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  addHumanAuthoredQuestions,
  createHumanQuestionAuthoringPacket,
} from '@/src/modules/benchmarks/human-question-benchmark';
import {
  generateScaleCorpus,
  summarizeScaleCorpus,
  validateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';

function stringArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const corpus = generateScaleCorpus();
const input = stringArgument('--validate');
if (input) {
  const inputPath = resolve(input);
  const packet: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  const enriched = addHumanAuthoredQuestions(corpus, packet);
  const errors = validateScaleCorpus(enriched);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    JSON.stringify(
      {
        valid: true,
        input: inputPath,
        humanAuthoredQuestions: enriched.questions.filter(
          (question) => question.cohort === 'human-authored',
        ).length,
        uniqueHumanQueries: new Set(
          enriched.questions
            .filter((question) => question.cohort === 'human-authored')
            .map((question) => question.query),
        ).size,
        corpus: summarizeScaleCorpus(enriched),
      },
      null,
      2,
    ),
  );
} else {
  const outputPath = resolve(
    stringArgument('--output') ?? '.benchmark/human-question-authoring.json',
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(createHumanQuestionAuthoringPacket(corpus), null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ output: outputPath, questions: corpus.questions.length / 3 }, null, 2));
}
