import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/steps.ts', 'steps/web.ts', 'steps/agent-plugins.ts', 'steps/devflow.ts', 'steps/fixtures.ts'],
  outputDir: '.bddgen',
});

export default defineConfig({
  testDir,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
});
