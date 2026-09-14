import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { answerQuestion } from '@/src/modules/ai/answer-service';
import { contextRequestSchema } from '@/src/modules/context/types';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = contextRequestSchema.parse(await request.json());
    const actor = await resolveRequestActor(request, {
      operationClass: 'read',
    });
    const response = await answerQuestion(
      {
        id: actor.id,
        workspaceId: actor.workspaceId,
        name: actor.name,
        role: actor.role,
      },
      input,
    );
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Ask request failed', error);
    return NextResponse.json(
      { type: 'ask-failure', title: 'An answer could not be assembled.' },
      { status: 500 },
    );
  }
}
