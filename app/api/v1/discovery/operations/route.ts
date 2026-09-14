import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  DiscoveryOperationPermissionError,
  operateDiscovery,
} from '@/src/modules/discovery/discovery-operations';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';

export const runtime = 'nodejs';

const operationSchema = z
  .object({ operation: z.enum(['pause', 'resume', 'run-now']) })
  .strict();

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        type: 'demo-mutation-disabled',
        title:
          'Discovery operations require production authentication before deployment.',
      },
      { status: 403 },
    );
  }
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
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
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
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
