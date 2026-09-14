import { IDS } from '@/src/modules/canonical/ids';

export type ActorCapability =
  | 'hypothesis.review'
  | 'monitor.operate'
  | 'ontology.review';

export interface CapabilityActor {
  id: string;
  role: string;
  capabilities?: ActorCapability[];
  authenticationMode?: 'demo' | 'oidc';
}

export function actorHasCapability(
  actor: CapabilityActor,
  capability: ActorCapability,
) {
  if (actor.capabilities) return actor.capabilities.includes(capability);
  return (
    process.env.NODE_ENV !== 'production' &&
    actor.id === IDS.users.alex &&
    actor.role === 'Project Lead'
  );
}
