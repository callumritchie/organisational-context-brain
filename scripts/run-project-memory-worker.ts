import dotenv from 'dotenv';
import { getIngestionPool } from '@/src/db/pool';
import { runProjectMemoryWorkerOnce } from '@/src/modules/organisational-memory/project-memory-service';

dotenv.config({ path: '.env.local' });

try {
  const result = await runProjectMemoryWorkerOnce(
    `project-memory-cli-${process.pid}`,
  );
  console.log(JSON.stringify({ event: 'project_memory_worker', ...result }));
} finally {
  await getIngestionPool().end();
}
