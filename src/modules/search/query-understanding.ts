import { IDS } from '@/src/modules/canonical/ids';

const STOP_WORDS = new Set([
  'about', 'bank', 'currently', 'do', 'journey', 'know', 'the', 'their', 'users', 'we', 'what', 'why',
]);

export interface ResolvedAlias {
  id: string;
  name: string;
  type: string;
  matchedAlias: string;
  aliasType: string;
  identityKeys?: Array<{ sourceSystem: string; keyType: string; externalKey: string }>;
}

export function understandQuery(query: string, resolvedAliases: ResolvedAlias[] = []) {
  const lower = query.toLowerCase();
  const terms = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((term) => term.replace(/-+/g, ''))
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
  const expanded = new Set(terms);
  if (lower.includes('abandon')) {
    expanded.add('abandon');
    expanded.add('drop');
    expanded.add('stalled');
  }
  if (lower.includes('onboarding')) {
    expanded.add('onboarding');
    expanded.add('identity');
    expanded.add('verification');
  }
  const defaultEntities = [
    { id: IDS.resources.project, name: 'Atlas Onboarding', type: 'Project' },
    { id: IDS.resources.hypothesis, name: 'Identity verification drives abandonment', type: 'Hypothesis' },
  ];
  const resolvedIds = new Set(resolvedAliases.map((entity) => entity.id));
  return {
    intent: 'Explain current causes of onboarding abandonment using organisational evidence',
    tsQuery: [...expanded].map((term) => `${term}:*`).join(' | '),
    entities: [
      ...(resolvedAliases.length ? resolvedAliases : [{ id: IDS.resources.atlas, name: 'Atlas Bank', type: 'Client' }]),
      ...defaultEntities.filter((entity) => !resolvedIds.has(entity.id)),
    ],
  };
}
