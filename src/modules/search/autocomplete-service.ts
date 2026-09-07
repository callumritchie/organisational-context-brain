import { z } from 'zod';
import { withActorTransaction } from '@/src/db/actor-transaction';

export const autocompleteQuerySchema = z.string().trim().min(1).max(100);

export interface AutocompleteResult {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  matchedAlias: string | null;
}

export async function autocompleteResources(
  actor: { id: string; workspaceId: string },
  rawQuery: string,
  limit = 8,
) {
  const query = autocompleteQuerySchema.parse(rawQuery);
  return withActorTransaction({ actorId: actor.id, workspaceId: actor.workspaceId }, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      type: string;
      summary: string | null;
      matched_alias: string | null;
    }>(
      `SELECT resource.id, resource.canonical_name AS name, resource.semantic_type AS type,
        resource.summary, matched_alias.alias AS matched_alias
       FROM resources resource
       LEFT JOIN LATERAL (
         SELECT alias.alias
         FROM entity_aliases alias
         WHERE alias.resource_id = resource.id AND alias.alias ILIKE $1
         ORDER BY length(alias.alias)
         LIMIT 1
       ) matched_alias ON true
       WHERE resource.status = 'active'
         AND (resource.canonical_name ILIKE $1 OR matched_alias.alias IS NOT NULL)
       ORDER BY resource.canonical_name
       LIMIT $2`,
      [`%${query}%`, Math.min(Math.max(limit, 1), 20)],
    );
    return result.rows.map((row): AutocompleteResult => ({
      id: row.id,
      name: row.name,
      type: row.type,
      summary: row.summary,
      matchedAlias: row.matched_alias,
    }));
  });
}
