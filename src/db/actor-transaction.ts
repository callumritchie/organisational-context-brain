import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getAppPool } from './pool';

const actorContextSchema = z.object({
  actorId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export type ActorContext = z.infer<typeof actorContextSchema>;

export async function withActorTransaction<T>(
  rawContext: ActorContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const context = actorContextSchema.parse(rawContext);
  const client = await getAppPool().connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [context.actorId]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);

    const applied = await client.query<{ actor_id: string; workspace_id: string }>(
      'SELECT app_actor_id()::text AS actor_id, app_workspace_id()::text AS workspace_id',
    );
    if (
      applied.rows[0]?.actor_id !== context.actorId ||
      applied.rows[0]?.workspace_id !== context.workspaceId
    ) {
      throw new Error('Actor transaction scope could not be established');
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
