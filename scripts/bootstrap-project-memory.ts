import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { initializeProjectMemoryDemo } from '@/src/modules/organisational-memory/project-memory-service';

dotenv.config({ path: '.env.local' });

try {
  const state = await initializeProjectMemoryDemo();
  console.log(
    JSON.stringify({
      event: 'project_memory_bootstrapped',
      configured: state.configured,
      memories: state.memories.length,
      kickoffItems: state.kickoff?.items.length ?? 0,
      clientMemoryEnabled: state.clientMemory.enabled,
    }),
  );
} finally {
  await Promise.allSettled([getAppPool().end(), getIngestionPool().end()]);
}
