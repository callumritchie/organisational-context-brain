import { afterAll, describe, expect, it } from 'vitest';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { assembleContext } from '@/src/modules/context/context-service';

const query = "What do we currently know about why users abandon Atlas Bank's onboarding journey?";

describe('context service', () => {
  afterAll(async () => { await getAppPool().end(); });

  it('returns ranked, source-traceable evidence without an LLM', async () => {
    const context = await assembleContext(
      { id: IDS.users.alex, workspaceId: IDS.workspace, name: 'Alex Chen', role: 'Project Lead' },
      { query, maxEvidence: 6 },
    );
    expect(context.generatedBy).toBe('deterministic-extractive');
    expect(context.evidence).toHaveLength(4);
    expect(context.evidence.some((item) => item.source.uri.startsWith('meeting://'))).toBe(true);
    expect(context.evidence.every((item) => item.source.excerpt.length > 0)).toBe(true);
    expect(context.evidence.every((item) => item.provenance.assertionKind === 'source-backed')).toBe(true);
    expect(context.evidence[0]!.ranking.total).toBeGreaterThan(context.evidence[1]!.ranking.total);
    expect(context.rankingVersion).toBe('demo-ranking-v3');
    expect(context.retrieval).toEqual({
      mode: 'lexical-only',
      embeddingStatus: 'disabled',
      provider: null,
      model: null,
    });
    expect(context.evidence.every((item) => item.retrieval.lexicalRank !== null)).toBe(true);
    expect(context.evidence.every((item) => item.retrieval.semanticRank === null)).toBe(true);
    expect(context.evidence.every((item) => item.signals.snapshotVersion === 'northstar-signal-snapshot-v1')).toBe(true);
    expect(context.evidence.every((item) => item.signals.graphConnectivity === 1)).toBe(true);
    expect(context.evidence.every((item) => Object.keys(item.ranking).length === 9)).toBe(true);
    expect(context.graph.edges.some((edge) => edge.type === 'IS_FOR')).toBe(true);
    expect(context.graph.nodes.some((node) => node.type === 'MeetingNote')).toBe(true);
    expect(context.sourceSystems.map((source) => source.type)).toEqual([
      'crm-accounts',
      'documents',
      'meeting-notes',
      'messages',
      'research-repository',
    ]);
    expect(context.ontology).toMatchObject({
      version: 'northstar-ontology-v1',
      status: 'current',
    });
    expect(context.ontology.resourceTypes.some((type) => type.name === 'MeetingNote')).toBe(true);
    expect(context.ontology.resourceTypes.some((type) => type.name === 'Document')).toBe(true);
    expect(context.ontology.resourceTypes.some((type) => type.name === 'MessageThread')).toBe(true);
  });

  it('resolves Atlas aliases to one observable canonical resource', async () => {
    for (const alias of ['Atlas Bank', 'Atlas', 'atlas-bank', 'CRM account 381', 'Atlas client folder']) {
      const context = await assembleContext(
        { id: IDS.users.alex, workspaceId: IDS.workspace, name: 'Alex Chen', role: 'Project Lead' },
        { query: `What causes abandonment in ${alias} onboarding?`, maxEvidence: 6 },
      );
      const client = context.interpretedQuery.entities.find((entity) => entity.type === 'Client');
      expect(client).toMatchObject({ id: IDS.resources.atlas, matchedAlias: alias });
      expect(client?.identityKeys).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceSystem: 'crm', keyType: 'account-id', externalKey: '381' }),
        expect.objectContaining({ sourceSystem: 'documents', keyType: 'folder-id', externalKey: 'fld-atlas-381' }),
      ]));
    }
  }, 15_000);

  it('resolves a messaging channel to the project without duplicating it', async () => {
    const context = await assembleContext(
      { id: IDS.users.alex, workspaceId: IDS.workspace, name: 'Alex Chen', role: 'Project Lead' },
      { query: 'What happened in the Atlas onboarding channel?', maxEvidence: 6 },
    );
    const projects = context.interpretedQuery.entities.filter((entity) => entity.type === 'Project');
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: IDS.resources.project,
      matchedAlias: 'Atlas onboarding channel',
    });
    expect(projects[0]?.identityKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceSystem: 'messages', keyType: 'channel-id', externalKey: 'chn-atlas-onboarding' }),
      expect.objectContaining({ sourceSystem: 'messages', keyType: 'channel-slug', externalKey: 'atlas-onboarding' }),
    ]));
    expect(context.graph.nodes.some((node) => node.type === 'MessageThread')).toBe(true);
  });
});
