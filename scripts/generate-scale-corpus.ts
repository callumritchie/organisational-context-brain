import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  generateScaleCorpus,
  summarizeScaleCorpus,
  validateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';

function integerArgument(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value))
    throw new Error(`${name} must be followed by an integer`);
  return value;
}

function stringArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const corpus = generateScaleCorpus({
  recordCount: integerArgument('--records', 10_000),
  seed: integerArgument('--seed', 20_260_908),
});
const errors = validateScaleCorpus(corpus);
if (errors.length)
  throw new Error(
    `Corpus validation failed:\n${errors.slice(0, 20).join('\n')}`,
  );

const output = stringArgument('--output');
if (output) {
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(corpus)}\n`, 'utf8');
}

console.log(
  JSON.stringify(
    {
      ...summarizeScaleCorpus(corpus),
      output: output ? resolve(output) : null,
    },
    null,
    2,
  ),
);
