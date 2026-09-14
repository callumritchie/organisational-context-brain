import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import {
  applyResearchMutation,
  ResearchMutationPermissionError,
  researchMutationSchema,
} from '@/src/modules/mutations/research-mutation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        type: 'demo-mutation-disabled',
        title:
          'Research mutation requires production authentication before deployment.',
      },
      { status: 403 },
    );
  }
  try {
    const actor = await resolveRequestActor(request);
    const input = researchMutationSchema.parse(await request.json());
    const mutation = await applyResearchMutation(actor, input);
    return NextResponse.json(
      { mutation },
      { status: mutation.applied ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof ResearchMutationPermissionError) {
      return NextResponse.json(
        { type: 'forbidden', title: error.message },
        { status: 403 },
      );
    }
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Research mutation failed', error);
    return NextResponse.json(
      {
        type: 'mutation-failure',
        title: 'Research mutation could not be applied.',
      },
      { status: 500 },
    );
  }
}
