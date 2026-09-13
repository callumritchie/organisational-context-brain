import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import {
  MemoryReviewPermissionError,
  reviewMemoryCandidate,
} from '@/src/modules/memory/hypothesis-monitor';

export const runtime = 'nodejs';

const reviewSchema = z
  .object({
    decision: z.enum(['accept', 'dismiss']),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        type: 'demo-mutation-disabled',
        title:
          'Memory review requires production authentication before deployment.',
      },
      { status: 403 },
    );
  }
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const { candidateId } = await params;
    const candidate = z.string().uuid().parse(candidateId);
    const { decision } = reviewSchema.parse(await request.json());
    const memory = await reviewMemoryCandidate(actor, candidate, decision);
    return NextResponse.json({ memory });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof MemoryReviewPermissionError) {
      return NextResponse.json(
        { type: 'forbidden', title: error.message },
        { status: 403 },
      );
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Memory review failed', error);
    return NextResponse.json(
      {
        type: 'memory-review-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The memory proposal could not be reviewed.',
      },
      { status: 500 },
    );
  }
}
