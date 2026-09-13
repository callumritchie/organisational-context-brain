import { expect, test } from '@playwright/test';
import { IDS } from '@/src/modules/canonical/ids';

test('resolves evidence and changes safely for Morgan', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText(/mode=deterministic|provider=openai/).first(),
  ).toBeVisible();
  await expect(page.getByText('sources_healthy=5')).toBeVisible();
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
    page.getByText(/Inaccessible objects were excluded before search began/i),
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
    page.getByRole('heading', { name: 'How this output was produced' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: /Connect meaning/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Connect meaning/ }).click();
  const meaningDialog = page.getByRole('dialog', {
    name: 'Connect meaning details',
  });
  await expect(meaningDialog.getByText('INPUT', { exact: true })).toBeVisible();
  await expect(
    meaningDialog.getByText('OUTPUT', { exact: true }),
  ).toBeVisible();
  await expect(meaningDialog.getByText(/northstar-ontology-v1/)).toBeVisible();
  await expect(
    meaningDialog.getByText('PM-ready requirement seed'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close operation details' }).click();
  await page
    .getByRole('button', { name: /Monitor this same hypothesis/ })
    .click();
  const monitorDialog = page.getByRole('dialog', {
    name: 'Monitor hypothesis details',
  });
  await expect(monitorDialog.getByText('Not built')).toBeVisible();
  await expect(
    monitorDialog.getByText(
      /watch the durable hypothesis behind this question/i,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'Close operation details' }).click();
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
  expect((await applied.json()).mutation).toMatchObject({
    applied: true,
    finding: 'Clear eligibility guidance enables verification completion',
  });

  const replay = await request.post('/api/v1/demo/research-mutation', {
    headers: { 'x-demo-actor': IDS.users.alex },
    data: { mutation: 'eligibility-guidance-finding' },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).mutation.applied).toBe(false);

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
