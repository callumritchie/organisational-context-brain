import { describe, expect, it } from 'vitest';
import { perceiveExternalArtifact } from '@/src/modules/source-integration/perception';
import { simulatedExternalSourceAdapters } from '@/src/modules/source-integration/simulated-adapters';
import type { ExternalArtifact } from '@/src/modules/source-integration/types';

describe('simulated external-source perception', () => {
  it('turns four source modalities into exact, governed observations without an external call', async () => {
    const pages = await Promise.all(
      simulatedExternalSourceAdapters().map((adapter) =>
        adapter.listProjectChanges('atlas-onboarding'),
      ),
    );
    const artifacts = pages.flatMap((page) => page.artifacts);
    const observations = artifacts.flatMap((artifact) =>
      perceiveExternalArtifact(artifact),
    );

    expect(artifacts.map((artifact) => artifact.modality).sort()).toEqual([
      'document',
      'image',
      'table',
      'transcript',
    ]);
    expect(observations).toHaveLength(6);
    expect(new Set(observations.map((item) => item.locator.modality))).toEqual(
      new Set(['document', 'image', 'table', 'transcript']),
    );
    expect(
      observations.every(
        (item) =>
          item.governedTerms.includes('onboarding.abandonment') &&
          item.relationship?.objectRef === 'onboarding-abandonment',
      ),
    ).toBe(true);
    expect(
      pages.every((page) =>
        /HTTPS|CLI|MCP/.test(page.simulatedOperation.command),
      ),
    ).toBe(true);
  });

  it('is cursor-idempotent and forms no observations for a tombstone', async () => {
    const adapter = simulatedExternalSourceAdapters()[0];
    const first = await adapter.listProjectChanges('atlas-onboarding');
    const repeated = await adapter.listProjectChanges(
      'atlas-onboarding',
      first.nextCursor,
    );
    const tombstone: ExternalArtifact = {
      ...first.artifacts[0],
      deleted: true,
    };

    expect(repeated.artifacts).toEqual([]);
    expect(perceiveExternalArtifact(tombstone)).toEqual([]);
  });
});
