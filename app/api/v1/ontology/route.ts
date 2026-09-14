import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      type: 'direct-publication-retired',
      title:
        'Ontology changes must pass through the semantic proposal and steward-review workflow.',
    },
    { status: 410 },
  );
}
