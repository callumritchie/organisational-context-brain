import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';
import {
  OntologyProposalConflictError,
  OntologyProposalPermissionError,
  reviewOntologyProposal,
} from '@/src/modules/ontology/semantic-evolution';

export const runtime = 'nodejs';

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'ontology.review');
    const proposalId = z
      .string()
      .uuid()
      .parse((await params).proposalId);
    const input = reviewSchema.parse(await request.json());
    return NextResponse.json({
      evolution: await reviewOntologyProposal(
        actor,
        proposalId,
        input.decision,
        input.note,
      ),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof OntologyProposalPermissionError) {
      return NextResponse.json(
        { type: 'forbidden', title: error.message },
        { status: 403 },
      );
    }
    if (error instanceof OntologyProposalConflictError) {
      return NextResponse.json(
        { type: 'semantic-conflict', title: error.message },
        { status: 409 },
      );
    }
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'authentication-failed', title: error.message },
        { status: error.status },
      );
    }
    console.error('Semantic proposal review failed', error);
    return NextResponse.json(
      {
        type: 'semantic-review-failure',
        title: 'The semantic proposal could not be reviewed.',
      },
      { status: 500 },
    );
  }
}
