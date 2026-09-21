import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { DiscoveryReviewPermissionError } from '@/src/modules/discovery/discovery-demo';
import { reviewHypothesisCandidate } from '@/src/modules/hypotheses/hypothesis-service';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';
import { MemoryReviewPermissionError } from '@/src/modules/memory/hypothesis-monitor';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  origin: z.enum(['monitored', 'discovered']),
  candidateId: z.string().uuid(),
});
const reviewSchema = z
  .object({ decision: z.enum(['accept', 'dismiss']) })
  .strict();

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ origin: string; candidateId: string }>;
  },
) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'hypothesis.review');
    const parsedParams = paramsSchema.parse(await params);
    const { decision } = reviewSchema.parse(await request.json());
    return NextResponse.json(
      await reviewHypothesisCandidate(actor, {
        origin: parsedParams.origin,
        candidateId: parsedParams.candidateId,
        decision,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (
      error instanceof MemoryReviewPermissionError ||
      error instanceof DiscoveryReviewPermissionError
    ) {
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
    console.error('Unified hypothesis review failed', error);
    return NextResponse.json(
      {
        type: 'hypothesis-review-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The hypothesis proposal could not be reviewed.',
      },
      { status: 500 },
    );
  }
}
