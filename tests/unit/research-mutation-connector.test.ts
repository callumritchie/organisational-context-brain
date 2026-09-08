import { describe, expect, it } from 'vitest';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';

describe('research mutation connector', () => {
  it('advances once, exposes the prepared finding and does not regress its cursor', async () => {
    const connector = new ResearchFixtureConnector(true);
    const page = await connector.listChanges('research-fixture-v2');
    expect(page.nextCursor).toBe('research-fixture-v3-eligibility');
    expect(page.records.some((record) => record.externalId === 'atlas-eligibility-followup-009')).toBe(true);
    expect(await connector.listChanges(page.nextCursor)).toEqual({
      records: [],
      nextCursor: 'research-fixture-v3-eligibility',
    });

    expect(await new ResearchFixtureConnector().listChanges(page.nextCursor)).toEqual({
      records: [],
      nextCursor: 'research-fixture-v3-eligibility',
    });
  });
});
