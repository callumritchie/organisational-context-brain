import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { authorizeMutationRequest } from '@/src/modules/identity/mutation-authorization';
import {
  AuthenticationError,
  resolveRequestActor,
} from '@/src/modules/identity/request-actor';
import {
  captureProjectDebrief,
  generateProjectKickoffPack,
  ProjectMemoryPermissionError,
  reviewProjectMemory,
  runProjectBackgroundFormation,
} from '@/src/modules/organisational-memory/project-memory-service';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('capture-debrief'),
      memoryType: z.enum([
        'decision',
        'approach-pattern',
        'risk-response',
        'constraint-adaptation',
        'anti-pattern',
        'stakeholder-pattern',
      ]),
      statement: z.string().trim().min(20).max(1000),
      context: z.string().trim().max(2000).default(''),
      outcome: z.string().trim().max(1000).default(''),
    })
    .strict(),
  z.object({ operation: z.literal('run-background') }).strict(),
  z
    .object({
      operation: z.literal('review'),
      memoryId: z.string().uuid(),
      decision: z.enum(['approve', 'reject', 'correct']),
      note: z.string().trim().min(3).max(1000),
      correctedStatement: z.string().trim().min(20).max(1000).optional(),
    })
    .strict()
    .superRefine((input, context) => {
      if (input.decision === 'correct' && !input.correctedStatement) {
        context.addIssue({
          code: 'custom',
          path: ['correctedStatement'],
          message: 'A corrected statement is required.',
        });
      }
    }),
  z.object({ operation: z.literal('generate-kickoff') }).strict(),
]);

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    const input = requestSchema.parse(await request.json());
    if (input.operation === 'capture-debrief') {
      await authorizeMutationRequest(request, actor, 'memory.capture');
      return NextResponse.json({
        projectMemory: await captureProjectDebrief(actor, input),
      });
    }
    if (input.operation === 'run-background') {
      await authorizeMutationRequest(request, actor, 'memory.capture');
      return NextResponse.json({
        projectMemory: await runProjectBackgroundFormation(actor),
      });
    }
    if (input.operation === 'review') {
      await authorizeMutationRequest(request, actor, 'memory.review');
      return NextResponse.json({
        projectMemory: await reviewProjectMemory(actor, input),
      });
    }
    await authorizeMutationRequest(request, actor, 'kickoff.generate');
    return NextResponse.json({
      projectMemory: await generateProjectKickoffPack(actor),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { type: 'invalid-request', issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof ProjectMemoryPermissionError) {
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
    console.error('Project memory operation failed', error);
    return NextResponse.json(
      {
        type: 'project-memory-operation-failure',
        title:
          error instanceof Error
            ? error.message
            : 'The project memory operation failed.',
      },
      { status: 500 },
    );
  }
}
