import { getDiscoveryState } from '@/src/modules/discovery/discovery-demo';
import { getMemoryState } from '@/src/modules/memory/hypothesis-monitor';
import { projectHypothesisSystem } from './projection';

export async function getHypothesisSystemState(actor: {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
}) {
  const [memory, discovery] = await Promise.all([
    getMemoryState(actor),
    getDiscoveryState(actor),
  ]);
  return {
    hypotheses: projectHypothesisSystem(memory, discovery),
    memory,
    discovery,
  };
}
