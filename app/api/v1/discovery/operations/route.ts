import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  DiscoveryOperationPermissionError,
  operateDiscovery,
} from '@/src/modules/discovery/discovery-operations';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';

export const runtime = 'nodejs';

const operationSchema = z
  .object({ operation: z.enum(['pause', 'resume', 'run-now']) })
  .strict();

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'discovery.operate');
    const { operation } = operationSchema.parse(await request.json());
    return NextResponse.json({
      discovery: await operateDiscovery(actor, operation),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof DiscoveryOperationPermissionError) {
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
    console.error('Discovery operation failed', error);
    return NextResponse.json(
      {
        type: 'discovery-operation-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The discovery operation could not be completed.',
      },
      { status: 500 },
    );
  }
}
