import { afterAll, describe, expect, it } from 'vitest';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { assembleContext } from '@/src/modules/context/context-service';
import { autocompleteResources } from '@/src/modules/search/autocomplete-service';

const query = "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const personas = {
  alex: { id: IDS.users.alex, workspaceId: IDS.workspace, name: 'Alex Chen', role: 'Project Lead' },
  jamie: { id: IDS.users.jamie, workspaceId: IDS.workspace, name: 'Jamie Patel', role: 'Consultant' },
  morgan: { id: IDS.users.morgan, workspaceId: IDS.workspace, name: 'Morgan Reed', role: 'External Contractor' },
};

const markers = {
  internal: ['Manual compliance hand-offs', 'research://northstar/atlas/internal/risk-003'],
  alex: ['Cedar Health', 'Cedar Renewal', 'Executive sponsors link status uncertainty', 'research://northstar/atlas/alex/'],
  jamie: ['Harbour Energy', 'Harbour Discovery', 'Paused identity checks are difficult to resume', 'research://northstar/atlas/jamie/'],
};

describe('complete persona leakage matrix', () => {
  afterAll(async () => { await getAppPool().end(); });

  it('keeps context, answer, evidence, graph and trace actor-specific', async () => {
    const [alex, jamie, morgan] = await Promise.all([
      assembleContext(personas.alex, { query, maxEvidence: 10 }),
      assembleContext(personas.jamie, { query, maxEvidence: 10 }),
      assembleContext(personas.morgan, { query, maxEvidence: 10 }),
    ]);
    const serialized = {
      alex: JSON.stringify(alex),
      jamie: JSON.stringify(jamie),
      morgan: JSON.stringify(morgan),
    };
    for (const marker of [...markers.internal, ...markers.alex]) expect(serialized.alex).toContain(marker);
    for (const marker of markers.jamie) expect(serialized.alex).not.toContain(marker);
    for (const marker of [...markers.internal, ...markers.jamie]) expect(serialized.jamie).toContain(marker);
    for (const marker of markers.alex) expect(serialized.jamie).not.toContain(marker);
    for (const marker of Object.values(markers).flat()) expect(serialized.morgan).not.toContain(marker);
    expect(alex.evidence).toHaveLength(5);
    expect(jamie.evidence).toHaveLength(5);
    expect(morgan.evidence).toHaveLength(3);
  });

  it('applies the same matrix to autocomplete', async () => {
    const [alexCedar, jamieCedar, morganCedar, alexHarbour, jamieHarbour, morganHarbour] = await Promise.all([
      autocompleteResources(personas.alex, 'Cedar'),
      autocompleteResources(personas.jamie, 'Cedar'),
      autocompleteResources(personas.morgan, 'Cedar'),
      autocompleteResources(personas.alex, 'Harbour'),
      autocompleteResources(personas.jamie, 'Harbour'),
      autocompleteResources(personas.morgan, 'Harbour'),
    ]);
    expect(alexCedar.map((item) => item.name)).toEqual(['Cedar Health', 'Cedar Renewal']);
    expect(jamieCedar).toEqual([]);
    expect(morganCedar).toEqual([]);
    expect(alexHarbour).toEqual([]);
    expect(jamieHarbour.map((item) => item.name)).toEqual(['Harbour Discovery', 'Harbour Energy']);
    expect(morganHarbour).toEqual([]);
  });
});
