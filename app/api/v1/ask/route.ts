import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { answerQuestion } from '@/src/modules/ai/answer-service';
import { contextRequestSchema } from '@/src/modules/context/types';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = contextRequestSchema.parse(await request.json());
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const response = await answerQuestion(
      { id: actor.id, workspaceId: actor.workspaceId, name: actor.name, role: actor.role },
      input,
    );
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ type: 'invalid-request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Ask request failed', error);
    return NextResponse.json({ type: 'ask-failure', title: 'An answer could not be assembled.' }, { status: 500 });
  }
}
