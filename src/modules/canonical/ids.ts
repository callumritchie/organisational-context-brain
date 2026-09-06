export const IDS = {
  workspace: '10000000-0000-4000-8000-000000000001',
  users: {
    alex: '20000000-0000-4000-8000-000000000001',
    jamie: '20000000-0000-4000-8000-000000000002',
    morgan: '20000000-0000-4000-8000-000000000003',
  },
  groups: {
    internal: '21000000-0000-4000-8000-000000000001',
  },
  scopes: {
    everyone: '30000000-0000-4000-8000-000000000001',
    internal: '30000000-0000-4000-8000-000000000002',
  },
  source: '40000000-0000-4000-8000-000000000001',
  sources: {
    research: '40000000-0000-4000-8000-000000000001',
    meetings: '40000000-0000-4000-8000-000000000002',
  },
  resources: {
    northstar: '50000000-0000-4000-8000-000000000001',
    atlas: '50000000-0000-4000-8000-000000000002',
    project: '50000000-0000-4000-8000-000000000003',
    hypothesis: '50000000-0000-4000-8000-000000000004',
    alex: '50000000-0000-4000-8000-000000000005',
    jamie: '50000000-0000-4000-8000-000000000006',
    morgan: '50000000-0000-4000-8000-000000000007',
  },
} as const;

export const PERSONAS = [
  { id: IDS.users.alex, name: 'Alex Chen', role: 'Project Lead', initials: 'AC' },
  { id: IDS.users.jamie, name: 'Jamie Patel', role: 'Consultant', initials: 'JP' },
  { id: IDS.users.morgan, name: 'Morgan Reed', role: 'External Contractor', initials: 'MR' },
] as const;

export type PersonaId = (typeof PERSONAS)[number]['id'];
