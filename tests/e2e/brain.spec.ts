import { expect, test } from '@playwright/test';
import { IDS } from '@/src/modules/canonical/ids';

test('resolves evidence and changes safely for Morgan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Evidence-led, deterministic')).toBeVisible();
  await expect(page.getByText('5 sources healthy')).toBeVisible();
  await expect(page.getByText('northstar-ontology-v1 · current')).toBeVisible();
  await expect(page.getByText('5 permitted results')).toBeVisible();
  await page.getByLabel('Demo persona').selectOption(IDS.users.morgan);
  await expect(page.getByText('3 permitted results')).toBeVisible();
  await expect(page.getByText('Manual compliance hand-offs compound verification delays')).toHaveCount(0);
  await expect(page.getByText(/inaccessible candidates never entered the pipeline/i)).toBeVisible();
});

test('context API is independently consumable', async ({ request }) => {
  const response = await request.post('/api/v1/context', {
    headers: { 'x-demo-actor': IDS.users.morgan },
    data: { query: 'Why do customers abandon Atlas onboarding?', maxEvidence: 6 },
  });
  expect(response.ok()).toBe(true);
  const context = await response.json();
  expect(context.actor.name).toBe('Morgan Reed');
  expect(context.evidence).toHaveLength(3);
  expect(JSON.stringify(context)).not.toContain('Internal verification operations note');
});

test('autocomplete API applies the same persona boundary', async ({ request }) => {
  const alex = await request.get('/api/v1/autocomplete?q=Cedar', {
    headers: { 'x-demo-actor': IDS.users.alex },
  });
  const morgan = await request.get('/api/v1/autocomplete?q=Cedar', {
    headers: { 'x-demo-actor': IDS.users.morgan },
  });
  expect(alex.ok()).toBe(true);
  expect(morgan.ok()).toBe(true);
  expect((await alex.json()).results.map((item: { name: string }) => item.name))
    .toEqual(['Cedar Health', 'Cedar Renewal']);
  expect((await morgan.json()).results).toEqual([]);
});
