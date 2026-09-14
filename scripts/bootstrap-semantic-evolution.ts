import dotenv from 'dotenv';
import { getIngestionPool } from '@/src/db/pool';
import { initializeSemanticEvolutionDemo } from '@/src/modules/ontology/semantic-evolution';

dotenv.config({ path: '.env.local' });

const proposalId = await initializeSemanticEvolutionDemo();
console.log(`Semantic change proposal ready: ${proposalId}`);
await getIngestionPool().end();
