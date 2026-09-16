import { NextResponse } from 'next/server';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { getProjectMemoryState } from '@/src/modules/organisational-memory/project-memory-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    return NextResponse.json({
      projectMemory: await getProjectMemoryState(actor),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Project memory state failed', error);
    return NextResponse.json(
      {
        type: 'project-memory-state-failure',
        title: 'The project memory state could not be read.',
      },
      { status: 500 },
    );
  }
}
