import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { DiscoveryOperationPermissionError } from '@/src/modules/discovery/discovery-operations';
import {
  operateHypothesisSystem,
  UnsupportedHypothesisOperationError,
} from '@/src/modules/hypotheses/hypothesis-service';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';
import { MonitorOperationPermissionError } from '@/src/modules/memory/monitor-operations';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  origin: z.enum(['monitored', 'discovered']),
});
const operationSchema = z
  .object({
    operation: z.enum([
      'pause',
      'resume',
      'run-now',
      'mark-notifications-read',
    ]),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ origin: string }> },
) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'monitor.operate');
    const { origin } = paramsSchema.parse(await params);
    const { operation } = operationSchema.parse(await request.json());
    return NextResponse.json(
      await operateHypothesisSystem(actor, { origin, operation }),
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      error instanceof UnsupportedHypothesisOperationError
    ) {
      return NextResponse.json(
        {
          type: 'invalid-request',
          ...(error instanceof ZodError
            ? { issues: error.issues }
            : { title: error.message }),
        },
        { status: 400 },
      );
    }
    if (
      error instanceof MonitorOperationPermissionError ||
      error instanceof DiscoveryOperationPermissionError
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
    console.error('Unified hypothesis operation failed', error);
    return NextResponse.json(
      {
        type: 'hypothesis-operation-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The hypothesis operation could not be completed.',
      },
      { status: 500 },
    );
  }
}
