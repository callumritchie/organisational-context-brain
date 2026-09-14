import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  DiscoveryReviewPermissionError,
  reviewDiscoveryCandidate,
} from '@/src/modules/discovery/discovery-demo';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';

export const runtime = 'nodejs';

const reviewSchema = z
  .object({ decision: z.enum(['accept', 'dismiss']) })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'discovery.review');
    const { candidateId } = await params;
    const candidate = z.string().uuid().parse(candidateId);
    const { decision } = reviewSchema.parse(await request.json());
    return NextResponse.json({
      discovery: await reviewDiscoveryCandidate(actor, candidate, decision),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof DiscoveryReviewPermissionError) {
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
    console.error('Discovery review failed', error);
    return NextResponse.json(
      {
        type: 'discovery-review-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The discovered hypothesis could not be reviewed.',
      },
      { status: 500 },
    );
  }
}
