import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import {
  MonitorOperationPermissionError,
  operateMonitor,
} from '@/src/modules/memory/monitor-operations';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        type: 'demo-operation-disabled',
        title:
          'Monitor operations require production authentication before deployment.',
      },
      { status: 403 },
    );
  }
  try {
    const actor = await resolveRequestActor(request);
    const input = operationSchema.parse(await request.json());
    return NextResponse.json({
      memory: await operateMonitor(actor, input.operation),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof MonitorOperationPermissionError) {
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
    console.error('Monitor operation failed', error);
    return NextResponse.json(
      {
        type: 'monitor-operation-failure',
        title: 'The monitor operation could not be completed.',
      },
      { status: 500 },
    );
  }
}
