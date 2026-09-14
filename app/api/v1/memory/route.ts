import { NextResponse } from 'next/server';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { getMemoryState } from '@/src/modules/memory/hypothesis-monitor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    return NextResponse.json({ memory: await getMemoryState(actor) });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
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
