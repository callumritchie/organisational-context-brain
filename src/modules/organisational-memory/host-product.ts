import { z } from 'zod';
import { IDS } from '@/src/modules/canonical/ids';

const memberSchema = z.object({
  actorId: z.string().uuid(),
  role: z.enum(['lead', 'contributor', 'viewer', 'service']),
  status: z.enum(['active', 'removed']),
});

const hostProjectSnapshotSchema = z
  .object({
    provider: z.string().min(1).max(80),
    externalProjectId: z.string().min(1).max(255),
    projectResourceId: z.string().uuid(),
    clientResourceId: z.string().uuid(),
    membershipRevision: z.string().min(1).max(255),
    members: z.array(memberSchema).min(1),
  })
  .superRefine((snapshot, context) => {
    const active = snapshot.members.filter(
      (member) => member.status === 'active',
    );
    if (!active.some((member) => member.role === 'lead')) {
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'An active project lead is required.',
      });
    }
    const actorIds = new Set<string>();
    for (const member of snapshot.members) {
      if (actorIds.has(member.actorId)) {
        context.addIssue({
          code: 'custom',
          path: ['members'],
          message: 'A project member may appear only once.',
        });
      }
      actorIds.add(member.actorId);
    }
  });

export type HostProjectSnapshot = z.infer<typeof hostProjectSnapshotSchema>;

export interface HostProductAdapter {
  readonly provider: string;
  readProject(externalProjectId: string): Promise<HostProjectSnapshot>;
}

export function validateHostProjectSnapshot(input: unknown) {
  return hostProjectSnapshotSchema.parse(input);
}

export class SyntheticHostProductAdapter implements HostProductAdapter {
  readonly provider = 'synthetic-host-product';

  async readProject(externalProjectId: string) {
    if (externalProjectId !== 'atlas-onboarding') {
      throw new Error('The synthetic host project does not exist.');
    }
    return validateHostProjectSnapshot({
      provider: this.provider,
      externalProjectId,
      projectResourceId: IDS.resources.project,
      clientResourceId: IDS.resources.atlas,
      membershipRevision: 'atlas-membership-v1',
      members: [
        { actorId: IDS.users.alex, role: 'lead', status: 'active' },
        { actorId: IDS.users.jamie, role: 'contributor', status: 'active' },
        { actorId: IDS.users.morgan, role: 'viewer', status: 'active' },
        { actorId: IDS.users.memoryAgent, role: 'service', status: 'active' },
      ],
    });
  }
}
