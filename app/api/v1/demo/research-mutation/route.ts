import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import {
  applyResearchMutation,
  ResearchMutationPermissionError,
  researchMutationSchema,
} from '@/src/modules/mutations/research-mutation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({
      type: 'demo-mutation-disabled',
      title: 'Research mutation requires production authentication before deployment.',
    }, { status: 403 });
  }
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const input = researchMutationSchema.parse(await request.json());
    const mutation = await applyResearchMutation(actor, input);
    return NextResponse.json({ mutation }, { status: mutation.applied ? 201 : 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ type: 'invalid-request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof ResearchMutationPermissionError) {
      return NextResponse.json({ type: 'forbidden', title: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Research mutation failed', error);
    return NextResponse.json({ type: 'mutation-failure', title: 'Research mutation could not be applied.' }, { status: 500 });
  }
}
