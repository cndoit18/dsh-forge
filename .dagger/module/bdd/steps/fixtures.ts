import type { Browser } from '@e2e-dev/web';
import type { Agent } from 'e2e';
import { openHost } from 'e2e/runner';
import type { E2EHost, E2ESession } from 'e2e/runner';
import { createBdd, test as base } from 'playwright-bdd';

type EngineFixtures = { browser: Browser };
type TestFixtures = {
  e2e: E2ESession<EngineFixtures>;
  ai: Agent;
};
type WorkerFixtures = { e2eHost: E2EHost<EngineFixtures> };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  e2eHost: [async ({}, use) => {
    const host = await openHost<EngineFixtures>({ target: 'web' });
    try {
      await use(host);
    } finally {
      const failures = await host.close();
      if (failures.length > 0) throw new AggregateError(failures, 'e2e host close failed');
    }
  }, { scope: 'worker' }],

  e2e: async ({ e2eHost }, use, testInfo) => {
    const session = await e2eHost.openSession({
      name: testInfo.titlePath.join(' › '),
      timeout: testInfo.timeout || undefined,
    });
    try {
      await use(session);
    } finally {
      const failures = await session.close();
      if (failures.length > 0) throw new AggregateError(failures, 'e2e session close failed');
    }
  },

  // Any step that requests AI skips its whole scenario when the gate is off.
  ai: async ({ e2e }, use, testInfo) => {
    if (process.env.E2E_AI !== '1') {
      testInfo.skip(true, 'Scenario requires AI (set E2E_AI=1 to enable)');
    }
    await use(e2e.fixtures.agent);
  },
});

export const { Given, When, Then } = createBdd(test);
