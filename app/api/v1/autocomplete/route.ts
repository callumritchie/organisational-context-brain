import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import { autocompleteResources } from '@/src/modules/search/autocomplete-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const query = new URL(request.url).searchParams.get('q') ?? '';
    const results = await autocompleteResources(
      { id: actor.id, workspaceId: actor.workspaceId },
      query,
    );
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ type: 'invalid-request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Autocomplete request failed', error);
    return NextResponse.json({ type: 'autocomplete-failure' }, { status: 500 });
  }
}
