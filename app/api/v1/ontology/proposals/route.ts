import { NextResponse } from 'next/server';
import { getSemanticEvolutionState } from '@/src/modules/ontology/semantic-evolution';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    return NextResponse.json({
      evolution: await getSemanticEvolutionState(actor),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
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
