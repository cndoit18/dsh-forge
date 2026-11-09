import { expect } from 'e2e';
import { Given, Then, When } from './fixtures.js';

Given('the authenticated Web GUI is open', async ({ e2e }) => {
  const token = process.env.DSH_TEST_TOKEN;
  if (!token) throw new Error('DSH_TEST_TOKEN is required');
  await e2e.fixtures.app.open(`/?token=${encodeURIComponent(token)}`);
  const continueButton = e2e.fixtures.screen.getByRole('button', { name: 'Continue' });
  await expect.poll(async () => continueButton.isVisible(), { timeout: 1_000 }).toBe(true).catch(() => {});
  if (await continueButton.isVisible()) await continueButton.tap();
  const closeGetStarted = e2e.fixtures.screen.getByRole('dialog', { name: 'Get started' }).getByRole('button', { name: 'Close' });
  await expect.poll(async () => closeGetStarted.isVisible(), { timeout: 1_000 }).toBe(true).catch(() => {});
  if (await closeGetStarted.isVisible()) await closeGetStarted.tap();
});

When('I send {string} to the agent', async ({ e2e }, message: string) => {
  const editor = e2e.fixtures.screen.getByRole('textbox').last();
  await editor.tap();
  await editor.fill(message);
  const send = e2e.fixtures.screen.getByRole('button', { name: /^(Send message|发送消息)$/ }).last();
  await expect(send).toBeEnabled();
  await send.tap();
  const conversation = e2e.fixtures.browser.locator('[data-conversation-region="chat"]');
  await expect(conversation.getByText(message, { exact: true })).toBeVisible();
});

Then('I see {string} in the conversation', async ({ e2e }, text: string) => {
  const conversation = e2e.fixtures.browser.locator('[data-conversation-region="chat"]');
  await expect(conversation.getByText(text, { exact: true })).toBeVisible();
});
