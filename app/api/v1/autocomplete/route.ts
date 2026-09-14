import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { autocompleteResources } from '@/src/modules/search/autocomplete-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    const query = new URL(request.url).searchParams.get('q') ?? '';
    const results = await autocompleteResources(
      { id: actor.id, workspaceId: actor.workspaceId },
      query,
    );
    return NextResponse.json({ results });
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
    console.error('Autocomplete request failed', error);
    return NextResponse.json({ type: 'autocomplete-failure' }, { status: 500 });
  }
}
