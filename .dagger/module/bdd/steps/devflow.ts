import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { expect } from 'e2e';
import { Then, When } from './fixtures.js';

const devflowCommands = ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research'];
const builtInMenuItems = ['File', 'Goal', 'Plan', 'Feedback', 'Compact', 'Permission', 'Model', 'Export'];
const installedPluginComponents = [
  { name: '@dshforge/agent-plugins', title: '@dshforge/agent-plugins', rows: [{ id: 'agent-plugins', moduleName: '@dshforge/agent-plugins' }] },
  {
    name: '@dshforge/workflows-bundle',
    title: '@dshforge/workflows-bundle',
    rows: [
      { id: 'workflow-ptc', moduleName: '@deepseek-ai/dsh-workflow-ptc' },
      { id: 'workflows', moduleName: '@dshforge/workflow' },
      { id: 'workflow-filesystem', moduleName: '@dshforge/workflow-filesystem' },
      { id: 'devflow', moduleName: '@dshforge/devflow' },
    ],
  },
];

async function executeHostCommand(browser: any, line: string, options: { agentPreset?: string; cwd?: string } = {}) {
  const { agentPreset, cwd } = options;
  const request = { ...(agentPreset === undefined ? {} : { agentPreset }), ...(cwd === undefined ? {} : { cwd }) };
  await browser.evaluate(`(async () => {
    const created = await fetch('/api/session/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-session', method: 'session/create', payload: { args: { request: ${JSON.stringify(request)} } } }),
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

When('I open the Plugins panel', async ({ e2e }) => {
  await e2e.fixtures.screen.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Plugins', exact: true }).tap();
});

Then('each installed plugin shows its declared running components', async ({ e2e }) => {
  const screen = e2e.fixtures.screen;
  await expect.poll(async () => e2e.fixtures.browser.evaluate(`[...document.querySelectorAll('[data-plugin-group="bundles"] [data-plugin-package]')].map(card => card.getAttribute('data-plugin-package')).sort()`)).toEqual(installedPluginComponents.map(plugin => plugin.name).sort());

  for (const plugin of installedPluginComponents) {
    const openLabel = await e2e.fixtures.browser.evaluate(`document.querySelector('[data-plugin-package="${plugin.name}"] button[aria-label]')?.getAttribute('aria-label')`);
    assert.ok(openLabel, `${plugin.name} has no detail button`);
    assert.ok(openLabel === `View ${plugin.title}` || openLabel === `查看 ${plugin.title}`, `${plugin.name} has the wrong title: ${openLabel}`);
    await screen.getByRole('button', { name: openLabel, exact: true }).tap();
    await expect.poll(async () => e2e.fixtures.browser.evaluate(`document.querySelector('[data-plugin-detail="${plugin.name}"]') !== null`)).toBe(true);
    await expect.poll(async () => e2e.fixtures.browser.evaluate(`document.querySelectorAll('[data-plugin-detail="${plugin.name}"] [data-plugin-row]').length`)).toBe(plugin.rows.length);
    const rows = await e2e.fixtures.browser.evaluate(`[...document.querySelectorAll('[data-plugin-detail="${plugin.name}"] [data-plugin-row]')].map(row => ({
      id: (row.getAttribute('data-plugin-row') ?? '').replace(/^include:/, ''),
      text: row.textContent ?? '',
      state: row.getAttribute('data-state'),
    }))`);
    assert.deepEqual(rows.map((row: { id: string }) => row.id), plugin.rows.map(row => row.id));
    for (const [index, row] of rows.entries()) {
      assert.ok(row.text.includes(plugin.rows[index].moduleName), `${plugin.name}#${row.id} has the wrong module: ${row.text}`);
      assert.equal(row.state, null, `${plugin.name}#${row.id} is not running: ${row.text}`);
      assert.match(row.text, /Running|运行中/);
    }
    await screen.getByRole('button', { name: /^(Back to plugins|返回插件)$/ }).tap();
    await expect.poll(async () => e2e.fixtures.browser.evaluate(`document.querySelector('[data-plugin-detail="${plugin.name}"]') === null`)).toBe(true);
  }
});

Then('the menu contains all nine DevFlow commands', async ({ e2e }) => {
  const labels = await e2e.fixtures.browser.evaluate('[...document.querySelectorAll(\'[id^="dsh-slash-option-command-"]\')].map(element => element.textContent ?? \'\')');
  assert.ok(!labels.some((label: string) => label.includes('skillopt')), 'unexpected /skillopt; menu: ' + labels.join(' | '));
  for (const item of builtInMenuItems) {
    assert.ok(labels.some((label: string) => label.includes(item)), 'missing built-in ' + item + '; menu: ' + labels.join(' | '));
  }
  for (const command of devflowCommands) {
    assert.ok(labels.some((label: string) => label.includes(command)), 'missing /' + command + '; menu: ' + labels.join(' | '));
  }
});

When('I run the deep research command with a BDD question', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow');
});

async function assertDirectWorkflow(browser: any) {
  const result = await commandResult(browser);
  assert.equal(result.kind, 'success');
  const jobId = result.text.match(/workflow-[a-z0-9]+/)?.[0];
  assert.ok(jobId);
  await expect.poll(async () => (await submittedMessage(browser)).commandInput).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).runEnd).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).jobSettled).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).completionNotice).toBe(true);
  const submitted = await submittedMessage(browser, jobId);
  assert.equal(submitted.found, false);
  assert.ok(!submitted.tools.includes('devflow'), 'slash command must not call the devflow model tool');
  assert.ok(!submitted.tools.includes('run_workflow'), 'slash command must not call the workflow model tool');
  await expect.poll(async () => (await submittedMessage(browser, jobId)).blank).toBe(false);
}

Then('the deep research workflow completes without a user message or model tool call', async ({ e2e }) => {
  await assertDirectWorkflow(e2e.fixtures.browser);
});

When('I run a project filesystem workflow', async ({ e2e }) => {
  const project = '/bdd/.e2e/workflow-project';
  await rm(project, { recursive: true, force: true });
  await mkdir(project + '/.git', { recursive: true });
  await mkdir(project + '/.dsh/workflows', { recursive: true });
  await writeFile(project + '/.dsh/workflows/bdd-echo.js', `export const meta = {
  name: 'bdd-echo',
  description: 'BDD 项目工作流',
  input: { hint: '<问题>', required: true },
}
phase('Project')
const result = await agent('Answer this BDD filesystem workflow question: ' + args.input, { label: 'project-echo' })
if (result === null) throw new Error('Project agent failed')
return result
`);
  await executeHostCommand(e2e.fixtures.browser, '/bdd-echo BDD workflow', { cwd: project });
});

Then('the project filesystem workflow completes without a user message or model tool call', async ({ e2e }) => {
  await assertDirectWorkflow(e2e.fixtures.browser);
});

When('I run deep research with the ptc preset', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow', { agentPreset: 'ptc' });
});

const uiDevflowCommands = ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research'];

async function uiCommandEvidence(browser: any, name: string) {
  return browser.evaluate(`(async () => {
    const current = JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}');
    const sessionId = current.sessionId;
    if (!sessionId) return { ok: false, sessionId, current };
    const rpc = async (method, request) => {
      const response = await fetch('/api/' + method, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-ui-command', method, payload: { args: { request } } }),
      }).then(response => response.json());
      if (!response.result?.ok) throw new Error(method + ' failed: ' + JSON.stringify(response));
      return response.result.value;
    };
    const projection = await rpc('session/projections', { sessionId });
    const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 500 });
    const events = page.records.map(record => record.event);
    const commandRun = events.find(event => event.type === 'command/run' && event.data.name === ${JSON.stringify(name)});
    const commandDone = events.find(event => event.type === 'command/done' && event.data.commandId === commandRun?.data.commandId && event.data.kind === 'success');
    const runStart = events.find(event => event.type === 'tool-workflow/run-start' && event.data.name === ${JSON.stringify(name)});
    const runEnd = runStart !== undefined && events.some(event => event.type === 'tool-workflow/run-end' && event.data.runId === runStart.data.runId && event.data.stopReason === 'completed');
    const jobId = commandDone?.data.text?.match(/workflow-[a-z0-9]+/)?.[0];
    const jobSettled = jobId !== undefined && events.some(event => event.type === 'job/settled' && event.data.jobId === jobId && event.data.status === 'completed');
    return {
      ok: commandRun !== undefined && runEnd && jobSettled,
      sessionId,
      commandRun: commandRun?.data,
      commandDone: commandDone?.data,
      runStart: runStart?.data,
      runEnd,
      jobId,
      jobSettled,
      events: events.slice(-20).map(event => event.type),
    };
  })()`);
}

async function grantDangerFullAccess(browser: any) {
  const result = await browser.evaluate(`(async () => {
    const current = JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}');
    const response = await fetch('/api/commands/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'bdd-ui-permission', method: 'commands/execute',
        payload: { args: { agentId: current.sessionId, line: '/permission danger-full-access', submittedAttachments: [] } },
      }),
    }).then(response => response.json());
    return response.result?.value?.result;
  })()`);
  assert.equal(result?.kind, 'success');
}

When('I execute all nine DevFlow commands through the Web UI', async ({ e2e }) => {
  await grantDangerFullAccess(e2e.fixtures.browser);
  const completed: string[] = [];
  for (const name of uiDevflowCommands) {
    console.log('BDD UI command start:', name);
    const line = '/' + name + ' BDD UI execution';
    const editor = e2e.fixtures.screen.getByRole('textbox').last();
    await editor.tap();
    await editor.fill(line);
    const send = e2e.fixtures.screen.getByRole('button', { name: /^(Send message|发送消息)$/ }).last();
    await expect(send).toBeEnabled();
    await send.tap();
    await expect(e2e.fixtures.screen.getByText(line, { exact: true }).last()).toBeVisible();
    try {
      await expect.poll(async () => (await uiCommandEvidence(e2e.fixtures.browser, name)).ok).toBe(true);
    } catch (error) {
      console.error('BDD UI command failed:', name, JSON.stringify(await uiCommandEvidence(e2e.fixtures.browser, name)));
      throw error;
    }
    console.log('BDD UI command completed:', name);
    completed.push(name);
  }
  await e2e.fixtures.browser.evaluate(`sessionStorage.setItem('devflow.bdd.uiCompleted', ${JSON.stringify(JSON.stringify(completed))})`);
});

Then('all nine DevFlow commands complete through the Web UI', async ({ e2e }) => {
  const completed = JSON.parse(await e2e.fixtures.browser.evaluate("sessionStorage.getItem('devflow.bdd.uiCompleted')") as string);
  assert.deepEqual(completed, uiDevflowCommands);
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
