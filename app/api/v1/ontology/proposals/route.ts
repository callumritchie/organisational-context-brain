import { NextResponse } from 'next/server';
import { getSemanticEvolutionState } from '@/src/modules/ontology/semantic-evolution';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    return NextResponse.json({
      evolution: await getSemanticEvolutionState(actor),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Semantic evolution state failed', error);
    return NextResponse.json(
      {
        type: 'semantic-evolution-failure',
        title: 'The semantic change inbox could not be read.',
      },
      { status: 500 },
    );
  }
}
