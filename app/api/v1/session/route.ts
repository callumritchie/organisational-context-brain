import { NextResponse } from 'next/server';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    return NextResponse.json({
      actor: {
        id: actor.id,
        name: actor.name,
        role: actor.role,
        workspaceId: actor.workspaceId,
        authenticationMode: actor.authenticationMode,
        capabilities: actor.capabilities,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Session resolution failed', error);
    return NextResponse.json(
      {
        type: 'session-failure',
        title: 'The current session could not be resolved.',
      },
      { status: 500 },
    );
  }
}
