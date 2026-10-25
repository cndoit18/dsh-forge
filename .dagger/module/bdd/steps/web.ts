import { expect } from 'e2e';
import { Given, Then, When } from './fixtures.js';

Given('the authenticated Web GUI is open', async ({ e2e }) => {
  const token = process.env.DSH_TEST_TOKEN;
  if (!token) throw new Error('DSH_TEST_TOKEN is required');
  await e2e.fixtures.app.open(`/?token=${encodeURIComponent(token)}`);
  const continueButton = e2e.fixtures.screen.getByRole('button', { name: 'Continue' });
  await continueButton.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => {});
  if (await continueButton.isVisible()) await continueButton.tap();
});

When('I send {string} to the agent', async ({ e2e }, message: string) => {
  await e2e.fixtures.browser.evaluate(`(async () => {
    const message = ${JSON.stringify(message)};
    const createdResponse = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'bdd-create',
        method: 'session/create',
        payload: { args: { request: {} } },
      }),
    });
    const created = await createdResponse.json();
    const sessionId = created.result?.value?.sessionId;
    if (!sessionId) throw new Error('session/create failed: ' + JSON.stringify(created.result));

    const promptedResponse = await fetch('/api/session/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'bdd-prompt',
        method: 'session/prompt',
        payload: {
          args: {
            request: {
              requestId: 'bdd-aimock-prompt',
              sessionId,
              mode: 'queue',
              content: [{ type: 'text', text: message }],
            },
          },
        },
      }),
    });
    const prompted = await promptedResponse.json();
    if (!prompted.result?.ok) throw new Error('session/prompt failed: ' + JSON.stringify(prompted.result));
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }));
    return sessionId;
  })()`);
  await e2e.fixtures.app.open('/');
});

Then('I see {string} in the conversation', async ({ e2e }, text: string) => {
  await expect(e2e.fixtures.screen.getByText(text).first()).toBeVisible();
});

Then('the conversation input is available', async ({ e2e }) => {
  await expect(e2e.fixtures.screen.getByRole('textbox').first()).toBeVisible();
});
