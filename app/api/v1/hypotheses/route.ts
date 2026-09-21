import { NextResponse } from 'next/server';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { getHypothesisSystemState } from '@/src/modules/hypotheses/hypothesis-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    return NextResponse.json(await getHypothesisSystemState(actor));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Unified hypothesis state failed', error);
    return NextResponse.json(
      {
        type: 'hypothesis-state-failure',
        title: 'The unified hypothesis state could not be read.',
      },
      { status: 500 },
    );
  }
}
