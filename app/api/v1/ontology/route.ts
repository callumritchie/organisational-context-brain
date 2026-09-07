import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import {
  OntologyConflictError,
  OntologyPermissionError,
  ontologyRelationshipEditSchema,
  publishOntologyRelationshipForDemoActor,
} from '@/src/modules/ontology/ontology-editor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({
      type: 'demo-mutation-disabled',
      title: 'Ontology editing requires production authentication before deployment.',
    }, { status: 403 });
  }
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const input = ontologyRelationshipEditSchema.parse(await request.json());
    const ontology = await publishOntologyRelationshipForDemoActor(actor, input);
    return NextResponse.json({ ontology }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ type: 'invalid-request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof OntologyPermissionError) {
      return NextResponse.json({ type: 'forbidden', title: error.message }, { status: 403 });
    }
    if (error instanceof OntologyConflictError) {
      return NextResponse.json({ type: 'ontology-conflict', title: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Ontology publication failed', error);
    return NextResponse.json({ type: 'ontology-failure', title: 'Ontology version could not be published.' }, { status: 500 });
  }
}
