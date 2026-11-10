import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { expect } from 'e2e';
import { Then, When, type BddE2E } from './fixtures.js';

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

type CommandRow = {
  command: string;
  text: string;
};

async function commandRows(browser: any): Promise<CommandRow[]> {
  return browser.evaluate(`[...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')].map(button => ({
    command: button.querySelector(':scope > span:first-child')?.textContent ?? '',
    text: button.textContent ?? '',
  }))`);
}

async function executeUiCommand(e2e: BddE2E, name: string, line: string, options: { agentPreset?: string; cwd?: string } = {}) {
  const browser = e2e.fixtures.browser;
  const { agentPreset, cwd } = options;
  const workspacePath = cwd ?? '/workspace';
  await browser.evaluate(`(async () => {
    const workspaceResponse = await fetch('/api/workspace/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-workspace', method: 'workspace/create', payload: { args: { request: { path: ${JSON.stringify(workspacePath)} } } } }),
    }).then(response => response.json());
    const workspaceId = workspaceResponse.result?.value?.workspace?.workspaceId;
    if (!workspaceId) throw new Error('workspace/create failed: ' + JSON.stringify(workspaceResponse));
    const request = { workspaceId, ${agentPreset === undefined ? '' : `agentPreset: ${JSON.stringify(agentPreset)},`} };
    const created = await fetch('/api/session/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-session', method: 'session/create', payload: { args: { request } } }),
    }).then(response => response.json());
    const sessionId = created.result?.value?.sessionId;
    if (!sessionId) throw new Error('session/create failed: ' + JSON.stringify(created));
    ${agentPreset ? `if (created.result.value.agentPreset !== ${JSON.stringify(agentPreset)}) throw new Error('session/create did not select the requested preset');` : ''}
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }));
    sessionStorage.setItem('devflow.bdd.session', sessionId);
    sessionStorage.setItem('devflow.bdd.line', ${JSON.stringify(line)});
  })()`);
  await e2e.fixtures.app.open('/');
  await grantDangerFullAccess(browser);
  const editor = e2e.fixtures.screen.getByRole('textbox').last();
  await editor.tap();
  await editor.fill(line);
  const send = e2e.fixtures.screen.getByRole('button', { name: /^(Send message|发送消息)$/ }).last();
  await expect(send).toBeEnabled();
  await send.tap();
  await expect(e2e.fixtures.screen.getByText(line, { exact: true }).last()).toBeVisible();
  try {
    await expect.poll(async () => (await uiCommandEvidence(browser, name, line)).ok).toBe(true);
  } catch (error) {
    console.error('BDD UI command failed:', name, JSON.stringify(await uiCommandEvidence(browser, name, line)));
    throw error;
  }
  const evidence = await uiCommandEvidence(browser, name, line);
  await browser.evaluate(`sessionStorage.setItem('devflow.bdd.result', ${JSON.stringify(JSON.stringify(evidence.commandDone))})`);
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
    const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, maxMessages: 200 });
    const pending = Object.values(projection?.values?.inbox ?? {}).flat();
    const events = page.records.map(record => record.event);
    const commandName = line.slice(1).split(' ', 1)[0];
    const commandInput = events.some(event => event.type === 'command/run' && event.data.name === commandName && event.data.args === line.slice(commandName.length + 1));
    const submitted = [...pending, ...events.filter(event => event.type === 'user/message').map(event => event.data)];
    const found = submitted.some(message => message.content?.some(block => block.type === 'text' && block.text === line));
    const turnStarted = events.some(event => event.type === 'turn/start');
    return { found, commandInput, turnStarted, blank: projection?.values?.sessionListMetadata?.blank ?? null, tools: events.filter(event => event.type === 'tool/call').map(event => event.data.name) };
  })()`);
}

When('I inspect the DevFlow command menu', async ({ e2e }) => {
  await e2e.fixtures.screen.getByRole('button', { name: 'Add files or run commands' }).tap();
  await expect.poll(async () => (await commandRows(e2e.fixtures.browser)).length).toBeGreaterThan(0);
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
    }))`) as Array<{ id: string; text: string; state: string | null }>;
    assert.deepEqual(rows.map(row => row.id), plugin.rows.map(row => row.id));
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
  const rows = await commandRows(e2e.fixtures.browser);
  const commandNames = rows.map(row => row.command);
  assert.ok(!commandNames.includes('skillopt'), 'unexpected /skillopt; menu: ' + rows.map(row => row.text).join(' | '));
  for (const item of builtInMenuItems) {
    assert.ok(rows.some(row => row.text.includes(item)), 'missing built-in ' + item + '; menu: ' + rows.map(row => row.text).join(' | '));
  }
  for (const command of devflowCommands) {
    assert.ok(commandNames.includes(command), 'missing exact /' + command + '; commands: ' + commandNames.join(' | '));
    await expect(e2e.fixtures.screen.getByRole('option', { name: new RegExp('^' + command + '( |$)') })).toBeVisible();
  }
  await e2e.fixtures.browser.evaluate(`(() => {
    const button = [...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')].find(candidate => candidate.firstElementChild?.textContent === 'deep-research');
    const viewport = button?.closest('[role="listbox"]');
    if (!button || !viewport) return;
    const optionRect = button.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    viewport.scrollTop += optionRect.top + optionRect.height / 2 - (viewportRect.top + viewportRect.height / 2);
  })()`);
  await expect.poll(async () => e2e.fixtures.browser.evaluate(`(() => {
    const button = [...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')].find(candidate => candidate.firstElementChild?.textContent === 'deep-research');
    const viewport = button?.closest('[role="listbox"]');
    if (!button || !viewport) return false;
    const optionRect = button.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    return optionRect.top >= viewportRect.top && optionRect.bottom <= viewportRect.bottom;
  })()`)).toBe(true);
  await e2e.fixtures.browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await expect(e2e.fixtures.screen.getByRole('option', { name: /^deep-research( |$)/ })).toBeVisible();
});
When('I run the deep research command with a BDD question', async ({ e2e }) => {
  await executeUiCommand(e2e, 'deep-research', '/deep-research BDD scoped workflow');
});

async function assertQueuedCommand(browser: any) {
  const result = await commandResult(browser);
  assert.equal(result.kind, 'success');
  assert.equal(result.text, '工作流已提交，等待 Agent 启动。');
  await expect.poll(async () => (await submittedMessage(browser)).commandInput).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser)).found).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser)).turnStarted).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser)).blank).toBe(false);
}

async function assertBlueCommandWithoutReceipt(e2e: BddE2E, commandName: string) {
  const browser = e2e.fixtures.browser;
  const screen = e2e.fixtures.screen;
  const line = await browser.evaluate("sessionStorage.getItem('devflow.bdd.line')");
  const input = screen.getByRole('group', { name: /^(Command input|指令输入)$/ });
  await expect(input).toBeVisible();
  await expect.poll(async () => browser.evaluate(`document.querySelector('[data-workflow-command-input] [data-ref-chip="command"]')?.textContent`)).toBe('/' + commandName);
  await expect(screen.getByText(line, { exact: true })).toHaveCount(1);
  await expect(screen.getByText('工作流已提交，等待 Agent 启动。')).toHaveCount(0);
  const sessionId = await browser.evaluate("sessionStorage.getItem('devflow.bdd.session')");
  await expect.poll(async () => browser.evaluate(`document.querySelector('[data-row-key="session:${sessionId}"]')?.getClientRects().length > 0`)).toBe(true);
}

Then('the deep research request appears as a blue command without a submission receipt', async ({ e2e }) => {
  await assertQueuedCommand(e2e.fixtures.browser);
  await assertBlueCommandWithoutReceipt(e2e, 'deep-research');
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
  await executeUiCommand(e2e, 'bdd-echo', '/bdd-echo BDD workflow', { cwd: project });
});

Then('the project workflow request appears as a blue command without a submission receipt', async ({ e2e }) => {
  await assertQueuedCommand(e2e.fixtures.browser);
  await assertBlueCommandWithoutReceipt(e2e, 'bdd-echo');
});

When('I run debug in workspace A and create a session in workspace B after its first turn starts', async ({ e2e }) => {
  const browser = e2e.fixtures.browser;
  const workspaceA = '/bdd/.e2e/workspace-a';
  const workspaceB = '/bdd/.e2e/workspace-b';
  await rm(workspaceA, { recursive: true, force: true });
  await rm(workspaceB, { recursive: true, force: true });
  await mkdir(workspaceA + '/.git', { recursive: true });
  await mkdir(workspaceB + '/.git', { recursive: true });
  await executeUiCommand(e2e, 'debug', '/debug BDD cross-workspace', { cwd: workspaceA });
  await expect.poll(async () => (await submittedMessage(browser)).turnStarted).toBe(true);
  await browser.evaluate(`(async () => {
    const workspaceResponse = await fetch('/api/workspace/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-other-workspace', method: 'workspace/create', payload: { args: { request: { path: '${workspaceB}' } } } }),
    }).then(response => response.json());
    const workspaceId = workspaceResponse.result?.value?.workspace?.workspaceId;
    if (!workspaceId) throw new Error('workspace B workspace/create failed: ' + JSON.stringify(workspaceResponse));
    const created = await fetch('/api/session/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bdd-devflow-other-session', method: 'session/create', payload: { args: { request: { workspaceId } } } }),
    }).then(response => response.json());
    const sessionId = created.result?.value?.sessionId;
    if (!sessionId) throw new Error('workspace B session/create failed: ' + JSON.stringify(created));
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }));
  })()`);
  await e2e.fixtures.app.open('/');
});

Then("workspace A's session remains visible", async ({ e2e }) => {
  const browser = e2e.fixtures.browser;
  const sessionId = await browser.evaluate("sessionStorage.getItem('devflow.bdd.session')");
  const selector = '[data-row-key="session:' + sessionId + '"]';
  await expect.poll(async () => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getClientRects().length > 0`)).toBe(true);
  const started = await submittedMessage(browser);
  assert.equal(started.blank, false);
});

When('I run deep research with the ptc preset', async ({ e2e }) => {
  await executeUiCommand(e2e, 'deep-research', '/deep-research BDD scoped workflow', { agentPreset: 'ptc' });
});

async function uiCommandEvidence(browser: any, name: string, line: string) {
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
    const line = ${JSON.stringify(line)};
    const submitted = events.some(event => event.type === 'user/message' && event.data.content?.some(block => block.type === 'text' && block.text === line));
    const blank = projection?.values?.sessionListMetadata?.blank ?? null;
    return {
      ok: commandRun !== undefined && commandDone !== undefined && submitted && blank === false,
      sessionId,
      commandRun: commandRun?.data ?? null,
      commandDone: commandDone?.data ?? null,
      submitted,
      blank,
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

When('I queue all nine DevFlow commands through the Web UI', async ({ e2e }) => {
  await grantDangerFullAccess(e2e.fixtures.browser);
  for (const name of devflowCommands) {
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
      await expect.poll(async () => (await uiCommandEvidence(e2e.fixtures.browser, name, line)).ok).toBe(true);
    } catch (error) {
      console.error('BDD UI command failed:', name, JSON.stringify(await uiCommandEvidence(e2e.fixtures.browser, name, line)));
      throw error;
    }
    console.log('BDD UI command queued:', name);
  }
});

Then('all nine DevFlow commands are queued through the Web UI', async ({ e2e }) => {
  for (const name of devflowCommands) {
    const evidence = await uiCommandEvidence(e2e.fixtures.browser, name, '/' + name + ' BDD UI execution');
    assert.equal(evidence.ok, true, '/' + name + ' was not queued: ' + JSON.stringify(evidence));
    assert.equal(evidence.commandDone.kind, 'success');
    assert.equal(evidence.submitted, true, '/' + name + ' was not queued as a user message');
    assert.equal(evidence.blank, false, '/' + name + ' did not start a visible first turn');
  }
});

When('I run the batch command without an approved plan', async ({ e2e }) => {
  await executeUiCommand(e2e, 'batch', '/batch BDD isolated units');
});

Then('batch submits its planning message without starting worktree workers', async ({ e2e }) => {
  await assertQueuedCommand(e2e.fixtures.browser);
  const submitted = await submittedMessage(e2e.fixtures.browser);
  assert.ok(!submitted.tools.includes('create_worktree'), 'batch must not create worktrees before plan approval');
});
