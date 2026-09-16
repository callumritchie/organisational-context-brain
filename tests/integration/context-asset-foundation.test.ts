import { afterAll, describe, expect, it } from 'vitest';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { readContextFoundationState } from '@/src/modules/context-assets/foundation';

describe('permissioned context asset foundation', () => {
  afterAll(async () => getAppPool().end());

  it('returns the governed dependency chain through the actor-scoped app role', async () => {
    const state = await withActorTransaction(
      { actorId: IDS.users.alex, workspaceId: IDS.workspace },
      (client) => readContextFoundationState(client),
    );

    expect(state).toMatchObject({
      status: 'ready',
      summary: {
        assetCount: 3,
        certifiedCount: 3,
        readyCount: 3,
        blockingIssueCount: 0,
      },
    });
    expect(state.assets.map((asset) => asset.kind)).toEqual([
      'term',
      'metric',
      'skill',
    ]);
    expect(state.dependencies).toHaveLength(3);
  });

  it('never returns a provenance row whose source Resource is actor-inaccessible', async () => {
    const result = await withActorTransaction(
      { actorId: IDS.users.jamie, workspaceId: IDS.workspace },
      (client) =>
        client.query<{ asset_resource_id: string; source_resource_id: string }>(
          `SELECT source.asset_resource_id, source.source_resource_id
           FROM context_asset_sources source
           WHERE NOT actor_can_access_resource(source.source_resource_id)`,
        ),
    );

    expect(result.rows).toEqual([]);
  });
});
