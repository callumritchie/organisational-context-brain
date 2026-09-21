import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const TEST_DATABASE_PREFIX = 'org_brain_test_';
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseLocalPostgresUrl(value: string, label: string) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${label} must use PostgreSQL`);
  }
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      `${label} must target local PostgreSQL; isolated tests never create or drop remote databases`,
    );
  }
  return url;
}

function databaseUrl(source: URL, databaseName: string) {
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function safeDatabaseName(value: string) {
  if (!value.startsWith(TEST_DATABASE_PREFIX) || !/^[a-z0-9_]+$/.test(value)) {
    throw new Error(`Refusing unsafe test database name: ${value}`);
  }
  return value;
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed with ${signal ?? `exit ${code}`}`,
          ),
        );
      }
    });
  });
}

async function databaseTestFiles() {
  const directories = ['tests/integration', 'tests/security'];
  const files = await Promise.all(
    directories.map(async (directory) =>
      (await readdir(directory))
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => path.join(directory, file)),
    ),
  );
  return files.flat().sort();
}

const ownerUrl = parseLocalPostgresUrl(
  requiredEnvironment('DATABASE_URL_OWNER'),
  'DATABASE_URL_OWNER',
);
const appUrl = parseLocalPostgresUrl(
  requiredEnvironment('DATABASE_URL_APP'),
  'DATABASE_URL_APP',
);
const ingestionUrl = parseLocalPostgresUrl(
  requiredEnvironment('DATABASE_URL_INGEST'),
  'DATABASE_URL_INGEST',
);
const maintenanceUrl = databaseUrl(ownerUrl, 'postgres');
const maintenancePool = new Pool({
  connectionString: maintenanceUrl,
  max: 1,
  application_name: 'org-brain-isolated-test-control',
});
const runToken = randomUUID().replaceAll('-', '').slice(0, 12);
const templateDatabase = safeDatabaseName(
  `${TEST_DATABASE_PREFIX}${runToken}_template`,
);
const createdDatabases = new Set<string>();

async function createDatabase(databaseName: string, template?: string) {
  const target = safeDatabaseName(databaseName);
  const source = template ? safeDatabaseName(template) : null;
  await maintenancePool.query(
    source
      ? `CREATE DATABASE ${target} TEMPLATE ${source}`
      : `CREATE DATABASE ${target}`,
  );
  createdDatabases.add(target);
}

async function dropDatabase(databaseName: string) {
  const target = safeDatabaseName(databaseName);
  if (!createdDatabases.has(target)) {
    throw new Error(
      `Refusing to drop database not created by this run: ${target}`,
    );
  }
  await maintenancePool.query(`DROP DATABASE ${target} WITH (FORCE)`);
  createdDatabases.delete(target);
}

function environmentFor(databaseName: string) {
  return {
    ...process.env,
    DATABASE_URL_OWNER: databaseUrl(ownerUrl, databaseName),
    DATABASE_URL_APP: databaseUrl(appUrl, databaseName),
    DATABASE_URL_INGEST: databaseUrl(ingestionUrl, databaseName),
    DATABASE_POOL_MAX: '2',
    AI_MODE: 'offline',
    CHAT_PROVIDER: '',
    EMBEDDING_PROVIDER: '',
    OPENAI_API_KEY: '',
  };
}

let failure: unknown = null;
try {
  console.log(`Creating isolated template ${templateDatabase}`);
  await createDatabase(templateDatabase);
  const templateEnvironment = environmentFor(templateDatabase);
  await run('npm', ['run', 'db:migrate'], templateEnvironment);
  await run('npm', ['run', 'db:seed'], templateEnvironment);

  const files = await databaseTestFiles();
  const testFailures: Array<{ file: string; error: unknown }> = [];
  for (const [index, file] of files.entries()) {
    const databaseName = safeDatabaseName(
      `${TEST_DATABASE_PREFIX}${runToken}_${String(index + 1).padStart(2, '0')}`,
    );
    console.log(`\n[${index + 1}/${files.length}] ${file}`);
    await createDatabase(databaseName, templateDatabase);
    try {
      await run(
        'npx',
        ['vitest', 'run', file, '--no-file-parallelism'],
        environmentFor(databaseName),
      );
    } catch (error) {
      testFailures.push({ file, error });
    } finally {
      await dropDatabase(databaseName);
    }
  }
  if (testFailures.length) {
    throw new Error(
      `${testFailures.length} isolated database test file(s) failed: ${testFailures
        .map(({ file }) => file)
        .join(', ')}`,
      { cause: testFailures[0]?.error },
    );
  }
} catch (error) {
  failure = error;
} finally {
  for (const databaseName of [...createdDatabases].reverse()) {
    await dropDatabase(databaseName).catch((error) => {
      failure ??= error;
    });
  }
  await maintenancePool.end();
}

if (failure) throw failure;
