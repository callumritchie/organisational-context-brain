import type {
  ExternalArtifact,
  PerceivedObservation,
} from './types';

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function perceiveExternalArtifact(
  artifact: ExternalArtifact,
): PerceivedObservation[] {
  if (artifact.deleted) return [];
  if (artifact.modality === 'document') {
    return artifact.payload.pages.flatMap((page) => {
      const lower = page.text.toLowerCase();
      const signalStart = lower.indexOf('seven participants');
      if (signalStart < 0) return [];
      return [
        {
          observationType: 'fact' as const,
          statement:
            'Seven participants reported that indistinguishable processing, failure and retry states made document checking feel uncertain.',
          excerpt: page.text.slice(signalStart),
          confidence: 0.9,
          locator: {
            modality: 'document' as const,
            page: page.page,
            startOffset: signalStart,
            endOffset: page.text.length,
          },
          governedTerms: ['onboarding.abandonment'],
          relationship: {
            subjectRef: 'atlas-onboarding' as const,
            predicate: 'INDICATES' as const,
            objectRef: 'onboarding-abandonment' as const,
          },
        },
      ];
    });
  }
  if (artifact.modality === 'table') {
    return artifact.payload.rows.flatMap((row, index) => {
      const started = Number(row.started);
      const completed = Number(row.completed_within_7d);
      if (!Number.isFinite(started) || !Number.isFinite(completed) || started <= 0) {
        return [];
      }
      const abandonmentRate = round(((started - completed) / started) * 100);
      const variant = String(row.journey_variant);
      return [
        {
          observationType: 'metric' as const,
          statement: `${variant} onboarding abandonment was ${abandonmentRate}% for this governed weekly cohort.`,
          excerpt: JSON.stringify(row),
          confidence: 0.99,
          locator: {
            modality: 'table' as const,
            sheet: artifact.payload.sheet,
            row: index + 2,
            columns: [
              'journey_variant',
              'eligibility_route',
              'started',
              'completed_within_7d',
            ],
          },
          governedTerms: [
            'onboarding.abandonment',
            'metric.onboarding-abandonment-rate',
          ],
          relationship: {
            subjectRef: 'atlas-onboarding' as const,
            predicate: 'MEASURES' as const,
            objectRef: 'onboarding-abandonment' as const,
          },
        },
      ];
    });
  }
  if (artifact.modality === 'transcript') {
    return artifact.payload.segments.flatMap((segment) => {
      const challenges = /challenges|only cause/i.test(segment.text);
      const comparison = /completes much more often/i.test(segment.text);
      if (!challenges && !comparison) return [];
      return [
        {
          observationType: 'quote' as const,
          statement: challenges
            ? 'The project team explicitly challenged elapsed verification time as the only abandonment cause.'
            : 'The team observed higher completion in the assisted route despite similar document-check duration.',
          excerpt: `${segment.speaker}: ${segment.text}`,
          confidence: challenges ? 0.95 : 0.82,
          locator: {
            modality: 'transcript' as const,
            segmentId: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
          },
          governedTerms: ['onboarding.abandonment'],
          relationship: {
            subjectRef: 'atlas-onboarding' as const,
            predicate: challenges ? ('CHALLENGES' as const) : ('INDICATES' as const),
            objectRef: 'onboarding-abandonment' as const,
          },
        },
      ];
    });
  }
  const status = artifact.payload.regions.find(
    (region) => region.role === 'status',
  );
  const retry = artifact.payload.regions.find(
    (region) => region.id === 'retry-action',
  );
  if (!status || !retry) return [];
  return [
    {
      observationType: 'visual-signal',
      statement:
        'The document-check interface presents a processing message and a repeat-upload action without a distinct resolved-state explanation.',
      excerpt: `${status.text}; ${retry.text}`,
      confidence: 0.86,
      locator: {
        modality: 'image',
        regionId: `${status.id}+${retry.id}`,
        x: Math.min(status.x, retry.x),
        y: Math.min(status.y, retry.y),
        width: Math.max(status.width, retry.width),
        height: retry.y + retry.height - status.y,
      },
      governedTerms: ['onboarding.abandonment'],
      relationship: {
        subjectRef: 'atlas-onboarding',
        predicate: 'INDICATES',
        objectRef: 'onboarding-abandonment',
      },
    },
  ];
}
