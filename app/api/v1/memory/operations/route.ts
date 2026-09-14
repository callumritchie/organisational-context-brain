import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { resolveDemoActor } from '@/src/modules/identity/demo-actor';
import {
  MonitorOperationPermissionError,
  operateMonitor,
} from '@/src/modules/memory/monitor-operations';

export const runtime = 'nodejs';

const operationSchema = z.object({
  operation: z.enum(['pause', 'resume', 'run-now', 'mark-notifications-read']),
}).strict();

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        type: 'demo-operation-disabled',
        title: 'Monitor operations require production authentication before deployment.',
      },
      { status: 403 },
    );
  }
  try {
    const actor = resolveDemoActor(request.headers.get('x-demo-actor'));
    const input = operationSchema.parse(await request.json());
    return NextResponse.json({ memory: await operateMonitor(actor, input.operation) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ type: 'invalid-request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof MonitorOperationPermissionError) {
      return NextResponse.json({ type: 'forbidden', title: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Unknown demo persona') {
      return NextResponse.json({ type: 'invalid-actor' }, { status: 401 });
    }
    console.error('Monitor operation failed', error);
    return NextResponse.json(
      { type: 'monitor-operation-failure', title: 'The monitor operation could not be completed.' },
      { status: 500 },
    );
  }
}
