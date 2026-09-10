import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '3000';
const isolated = Boolean(process.env.PLAYWRIGHT_PORT);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: isolated
      ? `env EMBEDDING_PROVIDER= OPENAI_API_KEY= CHAT_PROVIDER= npm run start -- --port ${port}`
      : 'npm run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: !isolated,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
