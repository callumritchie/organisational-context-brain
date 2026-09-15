import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareMigrationLedger,
  migrationChecksum,
  readMigrationManifest,
} from '@/src/modules/operations/migration-manifest';
import { currentMigration } from '@/src/modules/operations/current-migration';

describe('migration integrity ledger', () => {
  const manifest = [
    { name: '0000.sql', checksum: migrationChecksum('SELECT 1') },
    { name: '0001.sql', checksum: migrationChecksum('SELECT 2') },
  ];

  it('accepts an exact ordered migration history', () => {
    expect(compareMigrationLedger(manifest, manifest)).toEqual({
      current: true,
      verified: 2,
      pending: [],
      changed: [],
      unexpected: [],
    });
  });

  it('distinguishes pending, changed and unexpected migrations', () => {
    expect(
      compareMigrationLedger(manifest, [
        { name: '0000.sql', checksum: 'changed' },
        { name: '0099.sql', checksum: 'unexpected' },
      ]),
    ).toEqual({
      current: false,
      verified: 0,
      pending: ['0001.sql'],
      changed: ['0000.sql'],
      unexpected: ['0099.sql'],
    });
  });

  it('keeps the runtime readiness marker bound to the latest migration', async () => {
    const actual = await readMigrationManifest(
      path.join(process.cwd(), 'src/db/migrations'),
    );
    expect(actual.at(-1)).toMatchObject(currentMigration);
  });
});
