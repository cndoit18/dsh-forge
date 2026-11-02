import assert from 'node:assert/strict';
import { expect } from 'e2e';
import { Then, When } from './fixtures.js';

const devflowCommands = ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research'];
const builtInMenuItems = ['File', 'Goal', 'Plan', 'Feedback', 'Compact', 'Permission', 'Model', 'Export'];

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

async function submittedMessage(browser: any, jobId?: string) {
  return browser.evaluate(`(async () => {
    const sessionId = sessionStorage.getItem('devflow.bdd.session');
    const line = sessionStorage.getItem('devflow.bdd.line');
    const jobId = ${JSON.stringify(jobId)};
    const rpc = async (method, request) => {
      const response = await fetch('/api/' + method, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-history', method, payload: { args: { request } } }),
      }).then(response => response.json());
      if (!response.result?.ok) throw new Error(method + ' failed: ' + JSON.stringify(response));
      return response.result.value;
    };
    const projection = await rpc('session/projections', { sessionId });
    const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 200 });
    const pending = Object.values(projection?.values?.inbox ?? {}).flat();
    const events = page.records.map(record => record.event);
    const commandInput = events.some(event => event.type === 'command/run' && '/' + event.data.name + (event.data.args ?? '') === line);
    const submitted = [...pending, ...events.filter(event => event.type === 'user/message').map(event => event.data)];
    const found = submitted.some(message => message.content?.some(block => block.type === 'text' && block.text === line));
    const runEnd = events.some(event => event.type === 'tool-workflow/run-end' && event.data.stopReason === 'completed');
    const jobSettled = jobId !== undefined && events.some(event => event.type === 'job/settled' && event.data.jobId === jobId && event.data.status === 'completed');
    const completionNotice = jobId !== undefined && submitted.some(message => message.source?.kind === 'tool-jobs' && message.content?.some(block => block.type === 'text' && block.text.includes('background job ' + jobId)));
    return { found, commandInput, runEnd, jobSettled, completionNotice, blank: projection?.values?.sessionListMetadata?.blank, tools: events.filter(event => event.type === 'tool/call').map(event => event.data.name) };
  })()`);
}

When('I inspect the DevFlow command menu', async ({ e2e }) => {
  await e2e.fixtures.screen.getByRole('button', { name: 'Add files or run commands' }).tap();
});

Then('the menu contains all nine DevFlow commands', async ({ e2e }) => {
  const labels = await e2e.fixtures.browser.evaluate('[...document.querySelectorAll(\'[id^="dsh-slash-option-command-"]\')].map(element => element.textContent ?? \'\')');
  assert.ok(!labels.some((label: string) => label.includes('skillopt')), 'unexpected /skillopt; menu: ' + labels.join(' | '));
  for (const item of builtInMenuItems) {
    assert.ok(labels.some((label: string) => label.includes(item)), 'missing built-in ' + item + '; menu: ' + labels.join(' | '));
  }
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
  await e2e.fixtures.screen.getByRole('textbox', { name: /\/ (commands|调用指令)/ }).fill('/' + query);
});

Then('the filtered DevFlow commands keep their icons', async ({ e2e }) => {
  await expect.poll(async () => e2e.fixtures.browser.evaluate(`(() => {
    const rows = [...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')];
    if (rows.some(button => button.firstElementChild?.textContent === 'deep-research')) return false;
    return ['simplify', 'verify'].every(command => {
      const row = rows.find(button => button.firstElementChild?.textContent === command);
      return row !== undefined && getComputedStyle(row, '::before').maskImage.includes('data:image/svg+xml');
    });
  })()`)).toBe(true);
});

When('I run the deep research command with a BDD question', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow');
});

Then('the deep research workflow completes without a user message or model tool call', async ({ e2e }) => {
  const result = await commandResult(e2e.fixtures.browser);
  assert.equal(result.kind, 'success');
  const jobId = result.text.match(/workflow-[a-z0-9]+/)?.[0];
  assert.ok(jobId);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser)).commandInput).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).runEnd).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).jobSettled).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).completionNotice).toBe(true);
  const submitted = await submittedMessage(e2e.fixtures.browser, jobId);
  assert.equal(submitted.found, false);
  assert.ok(!submitted.tools.includes('devflow'), 'slash command must not call the devflow model tool');
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).blank).toBe(false);
});

When('I run deep research with the ptc preset', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow', 'ptc');
});

When('I run the batch command without an approved plan', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/batch BDD isolated units');
});

Then('batch completes planning directly without starting worktree workers', async ({ e2e }) => {
  const result = await commandResult(e2e.fixtures.browser);
  assert.equal(result.kind, 'success');
  const jobId = result.text.match(/workflow-[a-z0-9]+/)?.[0];
  assert.ok(jobId);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser)).commandInput).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).runEnd).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).jobSettled).toBe(true);
  await expect.poll(async () => (await submittedMessage(e2e.fixtures.browser, jobId)).completionNotice).toBe(true);
  const submitted = await submittedMessage(e2e.fixtures.browser, jobId);
  assert.equal(submitted.found, false);
  assert.ok(!submitted.tools.includes('devflow'), 'slash command must not call the devflow model tool');
  assert.ok(!submitted.tools.includes('create_worktree'), 'batch must not create worktrees before plan approval');
});
