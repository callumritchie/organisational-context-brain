import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'live',
      service: 'organisational-context-brain',
      commit: process.env.APP_COMMIT_SHA ?? 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
