import { expect, test } from '@playwright/test';
import { IDS } from '@/src/modules/canonical/ids';

test('serves the application shell with a per-response script nonce', async ({
  request,
}) => {
  const first = await request.get('/');
  const second = await request.get('/');
  expect(first.ok()).toBe(true);
  expect(second.ok()).toBe(true);
  const firstPolicy = first.headers()['content-security-policy'];
  const secondPolicy = second.headers()['content-security-policy'];
  const firstNonce = /'nonce-([^']+)'/.exec(firstPolicy ?? '')?.[1];
  const secondNonce = /'nonce-([^']+)'/.exec(secondPolicy ?? '')?.[1];
  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
  expect(firstPolicy).toContain("'strict-dynamic'");
  expect(firstPolicy).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  expect(await first.text()).toContain(`nonce="${firstNonce}"`);
});

test('resolves evidence and changes safely for Morgan', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText(/mode=deterministic|provider=openai/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Atlas Onboarding/).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Open 5 evidence files/ }),
  ).toBeVisible();
  await page.getByLabel('Demo persona').selectOption(IDS.users.morgan);
  await expect(
    page.getByRole('button', { name: /Open 3 evidence files/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Manual compliance hand-offs compound verification delays'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Constrain access/ }).click();
  await expect(
    page.getByText(
      /Inaccessible objects were excluded before retrieval began/i,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

test('turns the brain into an inspectable product blueprint without page scrolling', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Trace', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: /Connect meaning/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /INPUT · LIVES OUTSIDE THE BRAIN/ })
    .click();
  const sourceJourney = page.getByRole('dialog', {
    name: 'Source to context journey',
  });
  await expect(
    sourceJourney.getByRole('heading', {
      name: 'How external data became usable context',
    }),
  ).toBeVisible();
  await expect(
    sourceJourney.getByText('Onboarding research readout'),
  ).toBeVisible();
  await expect(sourceJourney.getByText('SOURCE RECEIPT')).toBeVisible();
  await expect(
    sourceJourney.getByText('04 · ASSERTIONS FROM THIS OBSERVATION'),
  ).toBeVisible();
  await expect(sourceJourney.getByText('06 · ANSWER TRUST GATE')).toBeVisible();
  await sourceJourney.getByRole('button', { name: 'Hypothesis basis' }).click();
  await expect(
    sourceJourney.getByText('BACKGROUND HYPOTHESIS · NOT TRUSTED MEMORY'),
  ).toBeVisible();
  await expect(
    sourceJourney.getByText(/4 support · 0 challenge links/),
  ).toBeVisible();
  await expect(sourceJourney.getByText('NEXT EVALUATION')).toBeVisible();
  await sourceJourney.getByRole('button', { name: 'Governed context' }).click();
  await expect(
    sourceJourney.getByRole('heading', {
      name: 'Diagnose onboarding failure',
    }),
  ).toBeVisible();
  await sourceJourney.getByRole('button', { name: 'PM requirements' }).click();
  await expect(
    sourceJourney.getByText('Permission-aware connector contract'),
  ).toBeVisible();
  await expect(
    sourceJourney.getByRole('button', { name: 'Copy all' }),
  ).toBeVisible();
  await sourceJourney
    .getByRole('button', { name: 'Close source journey' })
    .click();
  await page.getByRole('button', { name: /Connect meaning/ }).click();
  const meaningDialog = page.getByRole('dialog', {
    name: 'Connect meaning details',
  });
  await expect(meaningDialog.getByText('INPUT', { exact: true })).toBeVisible();
  await expect(
    meaningDialog.getByText('OUTPUT', { exact: true }),
  ).toBeVisible();
  await expect(
    meaningDialog.getByText('current=northstar-ontology-v1', { exact: true }),
  ).toBeVisible();
  await expect(
    meaningDialog.getByText(
      'The brain noticed missing language; it did not rewrite itself.',
    ),
  ).toBeVisible();
  await expect(
    meaningDialog.getByText('PROPOSAL · NOT ACTIVE MEANING'),
  ).toBeVisible();
  await expect(meaningDialog.getByText('5 resources to replay')).toBeVisible();
  await expect(
    meaningDialog.getByRole('button', { name: 'Approve + activate' }),
  ).toBeVisible();
  await expect(
    meaningDialog.getByText('PM-ready requirement seed'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close operation details' }).click();
  await page
    .getByRole('button', { name: /Hypothesis monitor and memory loop/ })
    .click();
  const monitorDialog = page.getByRole('dialog', {
    name: 'Continual hypothesis and memory loop',
  });
  await expect(
    monitorDialog.getByText('Active', { exact: true }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('Patterns noticed before anyone asks a question'),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('Unlabeled source records', { exact: true }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('Ontology-guided pattern scan', { exact: true }),
  ).toBeVisible();
  await expect(monitorDialog.getByText('northstar-ontology-v1')).toBeVisible();
  await expect(
    monitorDialog.getByText('Hypothesis candidate', { exact: true }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('Accept or dismiss', { exact: true }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('PROPOSED HYPOTHESIS · NOT A FACT'),
  ).toBeVisible();
  await expect(monitorDialog.getByText('Form', { exact: true })).toBeVisible();
  await expect(
    monitorDialog.getByRole('button', { name: 'Run now' }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText('Proposed learnings are not trusted memory yet', {
      exact: true,
    }),
  ).toBeVisible();
  await monitorDialog.getByRole('button', { name: 'Run now' }).click();
  await expect(
    monitorDialog.getByText('no-model', { exact: true }),
  ).toBeVisible();
  await expect(
    monitorDialog.getByText(
      'Deterministic evidence-delta rules were sufficient.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'Close memory loop' }).click();
  await page.getByRole('button', { name: /Open \d evidence files/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Evidence used for this output' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

test('connects kickoff, working and debrief in one progressive lifecycle', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Trace', exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: '01 Kickoff' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Useful precedent before the project starts',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Five governance boundaries, not a ladder.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Policy', exact: true }).click();
  await expect(
    page.getByText('Client-wide memory is not consulted'),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Project memory workspace' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /^03 Debrief/ }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Decide what this project should teach the next one',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Most activity must not become memory.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('LIFECYCLE', { exact: true })).toBeVisible();
  await expect(page.getByText('REVIEW', { exact: true })).toBeVisible();
  await expect(page.getByText('OUTCOME', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add human debrief' }).click();
  await expect(
    page.getByLabel('What should this project remember?'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create reviewable candidate' }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: '02 Working' }).click();
  await expect(
    page.getByRole('heading', { name: 'The organisational answer' }),
  ).toBeVisible();
});

test('shows the persisted source-change propagation sequence', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Trace', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const memoryResponse = await request.get('/api/v1/memory', {
    headers: { 'x-demo-actor': IDS.users.alex },
  });
  const { memory } = await memoryResponse.json();
  await page.route('**/api/v1/demo/research-mutation', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        mutation: {
          applied: true,
          finding: 'Clear eligibility guidance enables verification completion',
          memory,
          propagation: {
            source: {
              connector: 'research-fixture',
              syncRunId: '10000000-0000-4000-8000-000000000001',
              eventId: '10000000-0000-4000-8000-000000000002',
              outcome: 'version-created',
            },
            version: {
              id: '10000000-0000-4000-8000-000000000003',
              sourceUri:
                'research://northstar/atlas/studies/eligibility-followup-009',
              updatedAt: '2026-09-02T15:15:00.000Z',
            },
            observation: {
              id: '10000000-0000-4000-8000-000000000004',
              title:
                'Clear eligibility guidance enables verification completion',
              process: 'research-semantic-mapper@1.0.0',
            },
            assertion: {
              id: '10000000-0000-4000-8000-000000000005',
              predicate: 'CONTRADICTS',
            },
            hypothesis: {
              evaluationRunId: '10000000-0000-4000-8000-000000000006',
              candidateId: '10000000-0000-4000-8000-000000000007',
              candidateStatus: 'proposed',
            },
            answerImpact: {
              before: 'supported',
              after: 'contested',
              evidenceDeltas: 1,
              explanation:
                'New evidence disputes the previously supported single-cause explanation.',
            },
          },
        },
      }),
    }),
  );

  await page.getByRole('button', { name: 'Simulate source change' }).click();
  const receipt = page.getByRole('dialog', {
    name: 'Source change propagation receipt',
  });
  await expect(
    receipt.getByRole('heading', {
      name: 'What changed—and what it affected',
    }),
  ).toBeVisible();
  await expect(receipt.getByText('Immutable version created')).toBeVisible();
  await expect(
    receipt.getByText('Reviewable counter-hypothesis formed'),
  ).toBeVisible();
  await expect(receipt.getByText('supported → contested')).toBeVisible();
  await expect(
    receipt.getByText(/does not automatically approve/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

test('context API is independently consumable', async ({ request }) => {
  const response = await request.post('/api/v1/context', {
    headers: { 'x-demo-actor': IDS.users.morgan },
    data: {
      query: 'Why do customers abandon Atlas onboarding?',
      maxEvidence: 6,
    },
  });
  expect(response.ok()).toBe(true);
  const context = await response.json();
  expect(context.actor.name).toBe('Morgan Reed');
  expect(context.evidence).toHaveLength(3);
  expect(JSON.stringify(context)).not.toContain(
    'Internal verification operations note',
  );
});

test('ask API reuses authorised context and works offline', async ({
  request,
}) => {
  const response = await request.post('/api/v1/ask', {
    headers: { 'x-demo-actor': IDS.users.morgan },
    data: {
      query: 'Why do customers abandon Atlas onboarding?',
      maxEvidence: 6,
    },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.context.actor.name).toBe('Morgan Reed');
  expect(payload.context.evidence).toHaveLength(3);
  expect(payload.answer).toMatchObject({
    mode: 'deterministic',
    fallbackReason: 'not-configured',
    provider: null,
  });
  expect(JSON.stringify(payload)).not.toContain(
    'Internal verification operations note',
  );
});

test('autocomplete API applies the same persona boundary', async ({
  request,
}) => {
  const alex = await request.get('/api/v1/autocomplete?q=Cedar', {
    headers: { 'x-demo-actor': IDS.users.alex },
  });
  const morgan = await request.get('/api/v1/autocomplete?q=Cedar', {
    headers: { 'x-demo-actor': IDS.users.morgan },
  });
  expect(alex.ok()).toBe(true);
  expect(morgan.ok()).toBe(true);
  expect(
    (await alex.json()).results.map((item: { name: string }) => item.name),
  ).toEqual(['Cedar Health', 'Cedar Renewal']);
  expect((await morgan.json()).results).toEqual([]);
});

test('a controlled research mutation makes later context contested', async ({
  request,
}) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_PORT),
    'Demo writes are intentionally disabled by the isolated production server.',
  );
  const denied = await request.post('/api/v1/demo/research-mutation', {
    headers: { 'x-demo-actor': IDS.users.jamie },
    data: { mutation: 'eligibility-guidance-finding' },
  });
  expect(denied.status()).toBe(403);

  const applied = await request.post('/api/v1/demo/research-mutation', {
    headers: { 'x-demo-actor': IDS.users.alex },
    data: { mutation: 'eligibility-guidance-finding' },
  });
  expect(applied.status()).toBe(201);
  const appliedPayload = await applied.json();
  expect(appliedPayload.mutation).toMatchObject({
    applied: true,
    finding: 'Clear eligibility guidance enables verification completion',
    memory: {
      configured: true,
      latestRun: {
        status: 'completed',
        material: true,
        before: { epistemicStatus: 'supported' },
        after: { epistemicStatus: 'contested' },
      },
      candidates: [
        expect.objectContaining({
          kind: 'counter-hypothesis',
          status: 'proposed',
          sourceUri:
            'research://northstar/atlas/studies/eligibility-followup-009',
        }),
      ],
    },
    propagation: {
      source: {
        connector: 'research-fixture',
        outcome: 'version-created',
      },
      version: {
        sourceUri:
          'research://northstar/atlas/studies/eligibility-followup-009',
      },
      observation: {
        title: 'Clear eligibility guidance enables verification completion',
      },
      assertion: { predicate: 'CONTRADICTS' },
      hypothesis: { candidateStatus: 'proposed' },
      answerImpact: {
        before: 'supported',
        after: 'contested',
        evidenceDeltas: 1,
      },
    },
  });
  expect(appliedPayload.mutation.propagation.version.id).toBeTruthy();
  expect(appliedPayload.mutation.propagation.assertion.id).toBeTruthy();
  expect(
    appliedPayload.mutation.propagation.hypothesis.evaluationRunId,
  ).toBeTruthy();

  const replay = await request.post('/api/v1/demo/research-mutation', {
    headers: { 'x-demo-actor': IDS.users.alex },
    data: { mutation: 'eligibility-guidance-finding' },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).mutation.applied).toBe(false);

  const candidateId = appliedPayload.mutation.memory.candidates[0].id;
  const deniedReview = await request.post(
    `/api/v1/memory/candidates/${candidateId}/review`,
    {
      headers: { 'x-demo-actor': IDS.users.jamie },
      data: { decision: 'accept' },
    },
  );
  expect(deniedReview.status()).toBe(403);

  const acceptedReview = await request.post(
    `/api/v1/memory/candidates/${candidateId}/review`,
    {
      headers: { 'x-demo-actor': IDS.users.alex },
      data: { decision: 'accept' },
    },
  );
  expect(acceptedReview.ok()).toBe(true);
  expect((await acceptedReview.json()).memory.candidates[0]).toMatchObject({
    id: candidateId,
    status: 'accepted',
  });

  const response = await request.post('/api/v1/context', {
    headers: { 'x-demo-actor': IDS.users.morgan },
    data: {
      query: 'Why do customers abandon Atlas onboarding?',
      maxEvidence: 6,
    },
  });
  expect(response.ok()).toBe(true);
  const context = await response.json();
  expect(context.evidence).toHaveLength(4);
  expect(context.epistemicState).toMatchObject({
    status: 'contested',
    supportingEvidence: 3,
    contradictingEvidence: 1,
  });
  expect(context.summary).toContain(
    'However, newer evidence disputes a single-cause explanation',
  );
  expect(context.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stance: 'CONTRADICTS',
        source: expect.objectContaining({
          uri: 'research://northstar/atlas/studies/eligibility-followup-009',
        }),
      }),
    ]),
  );
});
