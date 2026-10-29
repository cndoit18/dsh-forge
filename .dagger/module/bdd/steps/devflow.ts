import assert from 'node:assert/strict';
import { expect } from 'e2e';
import { Then, When } from './fixtures.js';

const devflowCommands = ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research'];

async function executeHostCommand(browser: any, line: string, agentPreset?: string) {
  await browser.evaluate(`(async () => {
    const created = await fetch('/api/session/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-session', method: 'session/create', payload: { args: { request: ${agentPreset ? `{ agentPreset: ${JSON.stringify(agentPreset)} }` : '{}'} } } }),
    }).then(response => response.json());
    const sessionId = created.result?.value?.sessionId;
    if (!sessionId) throw new Error('session/create failed: ' + JSON.stringify(created));
    ${agentPreset ? `if (created.result.value.agentPreset !== ${JSON.stringify(agentPreset)}) throw new Error('session/create did not select the requested preset');` : ''}
    sessionStorage.setItem('devflow.bdd.session', sessionId);
    sessionStorage.setItem('devflow.bdd.line', ${JSON.stringify(line)});
    const permission = await fetch('/api/commands/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'bdd-devflow-permission', method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: '/permission danger-full-access', submittedAttachments: [] } },
      }),
    }).then(response => response.json());
    if (permission.result?.value?.result?.kind !== 'success') throw new Error('BDD permission setup failed: ' + JSON.stringify(permission));
    const executed = await fetch('/api/commands/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'bdd-devflow-command', method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: ${JSON.stringify(line)}, submittedAttachments: [] } },
      }),
    }).then(response => response.json());
    const result = executed.result?.value?.result;
    if (!result) throw new Error('commands/execute failed: ' + JSON.stringify(executed));
    sessionStorage.setItem('devflow.bdd.result', JSON.stringify(result));
  })()`);
}

async function commandResult(browser: any) {
  return JSON.parse(await browser.evaluate('sessionStorage.getItem(\'devflow.bdd.result\')') as string);
}

async function submittedMessage(browser: any) {
  return browser.evaluate(`(async () => {
    const sessionId = sessionStorage.getItem('devflow.bdd.session');
    const line = sessionStorage.getItem('devflow.bdd.line');
    const rpc = async (method, request) => {
      const response = await fetch('/api/' + method, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-history', method, payload: { args: { request } } }),
      }).then(response => response.json());
      if (!response.result?.ok) throw new Error(method + ' failed: ' + JSON.stringify(response));
      return response.result.value;
    };
    const projection = await rpc('session/projections', { sessionId });
    const pending = Object.values(projection?.values?.inbox ?? {}).flat();
    const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 20 });
    const events = page.records.map(record => record.event);
    const submitted = [...pending, ...events.filter(event => event.type === 'user/message').map(event => event.data)];
    const found = submitted.some(message => message.content?.some(block => block.type === 'text' && block.text === line));
    return { found, blank: projection?.values?.sessionListMetadata?.blank, tools: events.filter(event => event.type === 'tool/call').map(event => event.data.name) };
  })()`);
}

When('I inspect the DevFlow command menu', async ({ e2e }) => {
  await e2e.fixtures.screen.getByRole('button', { name: 'Add files or run commands' }).tap();
});

Then('the menu contains all nine DevFlow commands', async ({ e2e }) => {
  const labels = await e2e.fixtures.browser.evaluate('[...document.querySelectorAll(\'[id^="dsh-slash-option-command-"]\')].map(element => element.textContent ?? \'\')');
  for (const command of devflowCommands) {
    assert.ok(labels.some((label: string) => label.includes(command)), 'missing /' + command + '; menu: ' + labels.join(' | '));
    await expect.poll(async () => e2e.fixtures.browser.evaluate(`[...document.querySelectorAll('button[role="option"]')].filter(button => getComputedStyle(button, '::before').maskImage.includes('data:image/svg+xml')).length`)).toBe(9);
    const localizedLabels = await e2e.fixtures.browser.evaluate(`[...document.querySelectorAll('button[role="option"]')].slice(8).map(button => getComputedStyle(button.firstElementChild, '::before').content)`);
    const language = await e2e.fixtures.browser.evaluate('document.documentElement.lang');
    const expectedLabels = language === 'zh-CN'
      ? ['"批量 "', '"调试 "', '"深度研究 "', '"初始化 "', '"审查 "', '"运行 "', '"安全审查 "', '"简化 "', '"验证 "']
      : ['"Batch "', '"Debug "', '"Deep research "', '"Init "', '"Review "', '"Run "', '"Security review "', '"Simplify "', '"Verify "'];
    assert.deepEqual(localizedLabels, expectedLabels);
    const aliasStyle = await e2e.fixtures.browser.evaluate(`(() => {
      const label = document.querySelector('#dsh-slash-option-command-8 > span:first-child');
      return { color: getComputedStyle(label).color, fontSize: getComputedStyle(label).fontSize, labelColor: getComputedStyle(label, '::before').color };
    })()`);
    assert.notEqual(aliasStyle.color, aliasStyle.labelColor);
    assert.equal(aliasStyle.fontSize, '12px');
  }
});

When('I filter the DevFlow command menu with {string}', async ({ e2e }, query: string) => {
  await e2e.fixtures.screen.locator('[data-composer-input]').fill('/' + query);
});

Then('the filtered DevFlow commands keep their icons', async ({ e2e }) => {
  await expect.poll(async () => e2e.fixtures.browser.evaluate(`(() => {
    const rows = [...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')];
    return ['simplify', 'verify'].every(command => {
      const row = rows.find(button => button.firstElementChild?.textContent === command);
      return row !== undefined && getComputedStyle(row, '::before').maskImage.includes('data:image/svg+xml');
    });
  })()`)).toBe(true);
});

When('I run the deep research command with a BDD question', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow');
});

Then('the deep research request appears as a user message', async ({ e2e }) => {
  const result = await commandResult(e2e.fixtures.browser);
  assert.deepEqual(result, { kind: 'success' });
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser)).found).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser)).blank).toBe(false);
});

When('I run deep research with the ptc preset', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow', 'ptc');
});

When('I run the batch command without an approved plan', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/batch BDD isolated units');
});

Then('batch submits its planning message without starting worktree workers', async ({ e2e }) => {
  const result = await commandResult(e2e.fixtures.browser);
  assert.deepEqual(result, { kind: 'success' });
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser)).found).toBe(true);
  const submitted = await submittedMessage(e2e.fixtures.browser);
  assert.ok(!submitted.tools.includes('create_worktree'), 'batch must not create worktrees before plan approval');
});
