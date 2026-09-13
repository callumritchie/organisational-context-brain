import { NextResponse } from 'next/server';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import { getMemoryState } from '@/src/modules/memory/hypothesis-monitor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    return NextResponse.json({ memory: await getMemoryState(actor) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Memory state failed', error);
    return NextResponse.json(
      {
        type: 'memory-state-failure',
        title: 'The continual memory state could not be read.',
      },
      { status: 500 },
    );
  }
}
