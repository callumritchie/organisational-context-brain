import { IDS } from '@/src/modules/canonical/ids';

export const INITIAL_SIGNAL_FIXTURES = [
  {
    sourceExternalId: 'atlas-study-017',
    accessScopeId: IDS.scopes.everyone,
    observedAt: '2026-08-14T16:30:00.000Z',
    values: { authority: 0.92, freshness: 0.84, engagement: 0.88, affinity: 0.95, epistemicConfidence: 0.88 },
  },
  {
    sourceExternalId: 'atlas-funnel-review-006',
    accessScopeId: IDS.scopes.everyone,
    observedAt: '2026-08-22T11:20:00.000Z',
    values: { authority: 0.86, freshness: 0.9, engagement: 0.76, affinity: 0.92, epistemicConfidence: 0.81 },
  },
  {
    sourceExternalId: 'atlas-risk-note-003',
    accessScopeId: IDS.scopes.internal,
    observedAt: '2026-08-27T09:45:00.000Z',
    values: { authority: 0.95, freshness: 0.94, engagement: 0.62, affinity: 0.91, epistemicConfidence: 0.91 },
  },
  {
    sourceExternalId: 'atlas-weekly-2026-08-28',
    accessScopeId: IDS.scopes.everyone,
    observedAt: '2026-08-28T11:00:00.000Z',
    values: { authority: 0.84, freshness: 0.96, engagement: 0.82, affinity: 0.94, epistemicConfidence: 0.83 },
  },
  {
    sourceExternalId: 'atlas-executive-steering-004',
    accessScopeId: IDS.scopes.alexOnly,
    observedAt: '2026-08-29T12:00:00.000Z',
    values: { authority: 0.9, freshness: 0.95, engagement: 0.74, affinity: 0.9, epistemicConfidence: 0.86 },
  },
  {
    sourceExternalId: 'atlas-fieldwork-planning-005',
    accessScopeId: IDS.scopes.jamieOnly,
    observedAt: '2026-08-30T10:30:00.000Z',
    values: { authority: 0.82, freshness: 0.97, engagement: 0.69, affinity: 0.88, epistemicConfidence: 0.8 },
  },
] as const;
