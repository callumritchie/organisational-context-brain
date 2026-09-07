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
] as const;
