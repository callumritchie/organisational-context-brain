import { ContextStory } from '@/components/context-story';
import { connection } from 'next/server';

export default async function Home() {
  await connection();
  return <ContextStory />;
}
