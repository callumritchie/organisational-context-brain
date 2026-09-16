export const IDS = {
  workspace: '10000000-0000-4000-8000-000000000001',
  users: {
    alex: '20000000-0000-4000-8000-000000000001',
    jamie: '20000000-0000-4000-8000-000000000002',
    morgan: '20000000-0000-4000-8000-000000000003',
    ingestion: '20000000-0000-4000-8000-000000000004',
    memoryAgent: '20000000-0000-4000-8000-000000000005',
  },
  groups: {
    internal: '21000000-0000-4000-8000-000000000001',
  },
  scopes: {
    everyone: '30000000-0000-4000-8000-000000000001',
    internal: '30000000-0000-4000-8000-000000000002',
    alexOnly: '30000000-0000-4000-8000-000000000003',
    jamieOnly: '30000000-0000-4000-8000-000000000004',
  },
  source: '40000000-0000-4000-8000-000000000001',
  sources: {
    research: '40000000-0000-4000-8000-000000000001',
    meetings: '40000000-0000-4000-8000-000000000002',
    crm: '40000000-0000-4000-8000-000000000003',
    documents: '40000000-0000-4000-8000-000000000004',
    messages: '40000000-0000-4000-8000-000000000005',
    discoveryResearch: '40000000-0000-4000-8000-000000000006',
    discoveryMeetings: '40000000-0000-4000-8000-000000000007',
    discoveryCrm: '40000000-0000-4000-8000-000000000008',
    discoveryDocuments: '40000000-0000-4000-8000-000000000009',
    discoveryMessages: '40000000-0000-4000-8000-000000000010',
    hostProduct: '40000000-0000-4000-8000-000000000011',
  },
  monitors: {
    atlasAbandonment: '45000000-0000-4000-8000-000000000001',
  },
  modelPolicies: {
    background: '46000000-0000-4000-8000-000000000001',
  },
  monitorSchedules: {
    atlasAbandonment: '47000000-0000-4000-8000-000000000001',
  },
  discoveryPolicies: {
    supplierOnboarding: '48000000-0000-4000-8000-000000000001',
  },
  discoverySchedules: {
    supplierOnboarding: '49000000-0000-4000-8000-000000000001',
  },
  resources: {
    northstar: '50000000-0000-4000-8000-000000000001',
    atlas: '50000000-0000-4000-8000-000000000002',
    project: '50000000-0000-4000-8000-000000000003',
    hypothesis: '50000000-0000-4000-8000-000000000004',
    alex: '50000000-0000-4000-8000-000000000005',
    jamie: '50000000-0000-4000-8000-000000000006',
    morgan: '50000000-0000-4000-8000-000000000007',
    cedar: '50000000-0000-4000-8000-000000000008',
    cedarProject: '50000000-0000-4000-8000-000000000009',
    harbour: '50000000-0000-4000-8000-000000000010',
    harbourProject: '50000000-0000-4000-8000-000000000011',
    verdant: '50000000-0000-4000-8000-000000000012',
    supplierOnboarding: '50000000-0000-4000-8000-000000000013',
  },
  organisationalMemory: {
    scopes: {
      atlasClient: '51000000-0000-4000-8000-000000000010',
      atlasProject: '51000000-0000-4000-8000-000000000011',
      organisation: '51000000-0000-4000-8000-000000000012',
    },
    projectBinding: '57000000-0000-4000-8000-000000000001',
    schedule: '57000000-0000-4000-8000-000000000002',
  },
} as const;

export const PERSONAS = [
  {
    id: IDS.users.alex,
    name: 'Alex Chen',
    role: 'Project Lead',
    initials: 'AC',
  },
  {
    id: IDS.users.jamie,
    name: 'Jamie Patel',
    role: 'Consultant',
    initials: 'JP',
  },
  {
    id: IDS.users.morgan,
    name: 'Morgan Reed',
    role: 'External Contractor',
    initials: 'MR',
  },
] as const;

export type PersonaId = (typeof PERSONAS)[number]['id'];
