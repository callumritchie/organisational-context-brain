import dotenv from 'dotenv';
import { getIngestionPool } from '@/src/db/pool';
import { enqueueDueProjectMemorySchedules } from '@/src/modules/organisational-memory/project-memory-service';

dotenv.config({ path: '.env.local' });

try {
  const result = await enqueueDueProjectMemorySchedules();
  console.log(JSON.stringify({ event: 'project_memory_schedule', ...result }));
} finally {
  await getIngestionPool().end();
}
