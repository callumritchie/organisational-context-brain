import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface MigrationDescriptor {
  name: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
}

export function migrationChecksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex');
}

export async function readMigrationManifest(directory: string) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return Promise.all(
    names.map(async (name): Promise<MigrationDescriptor> => {
      const sql = await readFile(path.join(directory, name), 'utf8');
      return { name, sql, checksum: migrationChecksum(sql) };
    }),
  );
}

export function compareMigrationLedger(
  manifest: Pick<MigrationDescriptor, 'name' | 'checksum'>[],
  applied: AppliedMigration[],
) {
  const expected = new Map(manifest.map((item) => [item.name, item.checksum]));
  const actual = new Map(applied.map((item) => [item.name, item.checksum]));
  const pending = manifest
    .filter((item) => !actual.has(item.name))
    .map((item) => item.name);
  const changed = manifest
    .filter(
      (item) =>
        actual.has(item.name) && actual.get(item.name) !== item.checksum,
    )
    .map((item) => item.name);
  const unexpected = applied
    .filter((item) => !expected.has(item.name))
    .map((item) => item.name);
  return {
    current:
      pending.length === 0 && changed.length === 0 && unexpected.length === 0,
    verified: manifest.length - pending.length - changed.length,
    pending,
    changed,
    unexpected,
  };
}
