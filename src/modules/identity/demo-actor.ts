import { IDS, PERSONAS, type PersonaId } from '@/src/modules/canonical/ids';

export function resolveDemoActor(headerValue: string | null) {
  const id = (headerValue ?? IDS.users.alex) as PersonaId;
  const persona = PERSONAS.find((candidate) => candidate.id === id);
  if (!persona) throw new Error('Unknown demo persona');
  return { ...persona, workspaceId: IDS.workspace };
}
