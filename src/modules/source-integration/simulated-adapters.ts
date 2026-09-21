import { stableId } from '@/src/modules/canonical/stable-id';
import {
  externalArtifactSchema,
  type ExternalArtifact,
  type ExternalSourceAdapter,
  type ExternalSourceDescriptor,
} from './types';

const apiArtifacts: ExternalArtifact[] = [
  externalArtifactSchema.parse({
    externalId: 'api-research-readout-v3',
    uri: 'simulated-api://research/atlas-onboarding/readout-v3.pdf',
    title: 'Onboarding research readout',
    mediaType: 'application/pdf',
    modality: 'document',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-12T15:30:00.000Z',
    visibility: 'everyone',
    deleted: false,
    payload: {
      pages: [
        {
          page: 1,
          text: 'Atlas onboarding research readout. Eligible customers were observed across assisted and self-serve journeys.',
        },
        {
          page: 2,
          text: 'Seven participants described the document-check screen as uncertain because processing, failure and retry states use the same visual treatment. This indicates status ambiguity may contribute to onboarding abandonment.',
        },
      ],
    },
  }),
  externalArtifactSchema.parse({
    externalId: 'api-journey-state-screen',
    uri: 'simulated-api://design/atlas-onboarding/document-check.png',
    title: 'Document-check journey screenshot',
    mediaType: 'image/png',
    modality: 'image',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedAt: '2026-09-12T15:32:00.000Z',
    visibility: 'everyone',
    deleted: false,
    payload: {
      width: 1170,
      height: 2532,
      regions: [
        {
          id: 'status-copy',
          x: 110,
          y: 520,
          width: 950,
          height: 180,
          text: 'We are checking your document',
          role: 'status',
        },
        {
          id: 'retry-action',
          x: 110,
          y: 1960,
          width: 950,
          height: 160,
          text: 'Upload document again',
          role: 'annotation',
        },
      ],
    },
  }),
];

const cliArtifacts: ExternalArtifact[] = [
  externalArtifactSchema.parse({
    externalId: 'cli-weekly-funnel-2026-w36',
    uri: 'simulated-cli://warehouse/atlas_onboarding_weekly.csv',
    title: 'Weekly onboarding funnel export',
    mediaType: 'text/csv',
    modality: 'table',
    createdAt: '2026-09-08T06:00:00.000Z',
    updatedAt: '2026-09-15T06:00:00.000Z',
    visibility: 'internal',
    deleted: false,
    payload: {
      sheet: 'weekly_funnel',
      columns: [
        'journey_variant',
        'eligibility_route',
        'started',
        'completed_within_7d',
      ],
      rows: [
        {
          journey_variant: 'self-serve',
          eligibility_route: 'standard',
          started: 800,
          completed_within_7d: 496,
        },
        {
          journey_variant: 'assisted',
          eligibility_route: 'standard',
          started: 200,
          completed_within_7d: 166,
        },
      ],
    },
  }),
];

const mcpArtifacts: ExternalArtifact[] = [
  externalArtifactSchema.parse({
    externalId: 'mcp-synthesis-call-2026-09-14',
    uri: 'simulated-mcp://meetings/atlas/synthesis-2026-09-14',
    title: 'Atlas synthesis call transcript',
    mediaType: 'application/vnd.transcript+json',
    modality: 'transcript',
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T11:02:00.000Z',
    visibility: 'everyone',
    deleted: false,
    payload: {
      segments: [
        {
          id: 'seg-18',
          speaker: 'Jamie Patel',
          startMs: 488000,
          endMs: 512000,
          text: 'The assisted route completes much more often, even though document checks take a similar amount of time.',
        },
        {
          id: 'seg-19',
          speaker: 'Alex Chen',
          startMs: 513000,
          endMs: 548000,
          text: 'That challenges elapsed time as the only cause. We should test whether visible status and reassurance explain the difference.',
        },
      ],
    },
  }),
];

class SimulatedExternalSourceAdapter implements ExternalSourceAdapter {
  constructor(
    readonly descriptor: ExternalSourceDescriptor,
    private readonly artifacts: ExternalArtifact[],
    private readonly command: string,
  ) {}

  async listProjectChanges(externalProjectId: string, cursor?: string | null) {
    if (externalProjectId !== 'atlas-onboarding') {
      throw new Error('The simulated source has no matching project.');
    }
    const nextCursor = `${this.descriptor.id}-2026-09-15`;
    return {
      artifacts: cursor === nextCursor ? [] : this.artifacts,
      nextCursor,
      entitlementRevision: this.descriptor.entitlementRevision,
      simulatedOperation: {
        command: this.command,
        responseShape: `${this.artifacts.length} synthetic ${this.descriptor.transport} artifact(s)`,
      },
    };
  }
}

export function simulatedExternalSourceAdapters(): ExternalSourceAdapter[] {
  return [
    new SimulatedExternalSourceAdapter(
      {
        id: stableId('external-connection', 'research-api'),
        provider: 'Simulated Research API',
        name: 'Research and design repository',
        transport: 'api',
        strategy: 'synchronised-copy',
        endpointLabel: 'GET /projects/{project}/files?changed_after={cursor}',
        entitlementRevision: 'research-acl-v12',
        freshnessSlaSeconds: 3_600,
        deletionMode: 'source-tombstone',
        capabilities: ['content', 'metadata', 'permissions', 'deletions'],
      },
      apiArtifacts,
      'HTTPS GET with cursor and project-scoped service credential',
    ),
    new SimulatedExternalSourceAdapter(
      {
        id: stableId('external-connection', 'warehouse-cli'),
        provider: 'Simulated Warehouse CLI',
        name: 'Governed analytics snapshot',
        transport: 'cli',
        strategy: 'authoritative-snapshot',
        endpointLabel: 'warehouse export --dataset onboarding_weekly --format csv',
        entitlementRevision: 'warehouse-grants-v8',
        freshnessSlaSeconds: 86_400,
        deletionMode: 'authoritative-snapshot',
        capabilities: ['content', 'metadata', 'permissions', 'deletions'],
      },
      cliArtifacts,
      'CLI export to ephemeral CSV followed by checksum verification',
    ),
    new SimulatedExternalSourceAdapter(
      {
        id: stableId('external-connection', 'meetings-mcp'),
        provider: 'Simulated Meetings MCP',
        name: 'Meeting transcript tool',
        transport: 'mcp',
        strategy: 'federated-query',
        endpointLabel: 'meetings.search(project_id, changed_after)',
        entitlementRevision: 'meetings-membership-v5',
        freshnessSlaSeconds: 900,
        deletionMode: 'query-time-authority',
        capabilities: ['content', 'metadata', 'permissions', 'deletions'],
      },
      mcpArtifacts,
      'MCP tool call using project and cursor arguments',
    ),
  ];
}
