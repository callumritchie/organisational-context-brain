import { NextResponse } from 'next/server';
import { getDiscoveryState } from '@/src/modules/discovery/discovery-demo';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    return NextResponse.json({ discovery: await getDiscoveryState(actor) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Discovery state failed', error);
    return NextResponse.json(
      {
        type: 'discovery-state-failure',
        title: 'The hypothesis discovery inbox could not be read.',
      },
      { status: 500 },
    );
  }
}
