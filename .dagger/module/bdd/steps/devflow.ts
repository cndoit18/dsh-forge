import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { expect } from 'e2e';
import { Then, When } from './fixtures.js';

const devflowCommands = ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research'];
const builtInMenuItems = ['File', 'Goal', 'Plan', 'Feedback', 'Compact', 'Permission', 'Model', 'Export'];

type CommandRow = {
  command: string;
  text: string;
  icon: string;
  label: string;
  decorated: boolean;
};

async function commandRows(browser: any): Promise<CommandRow[]> {
  return browser.evaluate(`[...document.querySelectorAll('button[id^="dsh-slash-option-command-"]')].map(button => {
    const alias = button.querySelector(':scope > span:first-child');
    return {
      command: alias?.textContent ?? '',
      text: button.textContent ?? '',
      icon: getComputedStyle(button, '::before').maskImage,
      label: alias === null ? '' : getComputedStyle(alias, '::before').content,
      decorated: button.hasAttribute('data-devflow-command'),
    };
  })`);
}

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
    const text = message => (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(' ');
    const found = submitted.some(message => message.content?.some(block => block.type === 'text' && block.text === line));
    const runEnd = events.some(event => event.type === 'tool-workflow/run-end' && event.data.stopReason === 'completed');
    const jobSettled = jobId !== undefined && events.some(event => event.type === 'job/settled' && event.data.jobId === jobId && event.data.status === 'completed');
    const notices = submitted.filter(message => message.source?.kind === 'tool-jobs' && text(message).includes('background job ' + jobId));
    const completionText = notices.length === 0 ? null : text(notices[notices.length - 1]);
    const agentStarts = events.filter(event => event.type === 'tool-workflow/agent-start').length;
    return {
      found, commandInput, runEnd, jobSettled, agentStarts, completionText,
      completionNotice: completionText !== null,
      blank: projection?.values?.sessionListMetadata?.blank,
      tools: events.filter(event => event.type === 'tool/call').map(event => event.data.name),
    };
  })()`);
}

When('I inspect the DevFlow command menu', async ({ e2e }) => {
  await e2e.fixtures.screen.getByRole('button', { name: 'Add files or run commands' }).tap();
  await expect.poll(async () => (await commandRows(e2e.fixtures.browser)).length).toBeGreaterThan(0);
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
  }
});

Then('each DevFlow command has a localized label and its own icon', async ({ e2e }) => {
  await expect.poll(async () => (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated).length).toBe(devflowCommands.length);
  const rows = (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated);
  assert.deepEqual(rows.map(row => row.command).sort(), [...devflowCommands].sort());
  const language = await e2e.fixtures.browser.evaluate('document.documentElement.lang');
  const expectedLabels = language === 'zh-CN'
    ? { batch: '"批量 "', debug: '"调试 "', 'deep-research': '"深度研究 "', init: '"初始化 "', review: '"审查 "', run: '"运行 "', 'security-review': '"安全审查 "', simplify: '"简化 "', verify: '"验证 "' }
    : { batch: '"Batch "', debug: '"Debug "', 'deep-research': '"Deep research "', init: '"Init "', review: '"Review "', run: '"Run "', 'security-review': '"Security review "', simplify: '"Simplify "', verify: '"Verify "' };
  for (const row of rows) {
    assert.equal(row.label, expectedLabels[row.command as keyof typeof expectedLabels], 'wrong localized label for /' + row.command);
    assert.ok(row.icon.includes('data:image/svg+xml'), 'missing icon for /' + row.command);
  }
  assert.equal(new Set(rows.map(row => row.icon)).size, devflowCommands.length, 'command icons must be distinct');
});

When('I filter the DevFlow command menu with {string}', async ({ e2e }, query: string) => {
  await expect.poll(async () => (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated).length).toBe(devflowCommands.length);
  const rows = (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated);
  const icons = Object.fromEntries(rows.map(row => [row.command, row.icon]));
  await e2e.fixtures.browser.evaluate(`sessionStorage.setItem('devflow.bdd.menuIcons', ${JSON.stringify(JSON.stringify(icons))})`);
  await e2e.fixtures.screen.getByRole('textbox', { name: /\/ (commands|调用指令)/ }).fill('/' + query);
});

Then('the filtered DevFlow commands keep their icons', async ({ e2e }) => {
  const expectedCommands = ['simplify', 'verify'];
  await expect.poll(async () => {
    const names = (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated).map(row => row.command).sort();
    return JSON.stringify(names) === JSON.stringify(expectedCommands);
  }).toBe(true);
  const rows = (await commandRows(e2e.fixtures.browser)).filter(row => row.decorated);
  const originalIcons = JSON.parse(await e2e.fixtures.browser.evaluate("sessionStorage.getItem('devflow.bdd.menuIcons')") as string);
  for (const row of rows) {
    assert.equal(row.icon, originalIcons[row.command], '/' + row.command + ' received a different command icon after filtering');
  }
});

When('I run the deep research command with a BDD question', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow');
});

async function assertDirectWorkflow(browser: any, expectedOutput: string[]) {
  const result = await commandResult(browser);
  assert.equal(result.kind, 'success');
  const jobId = result.text.match(/workflow-[a-z0-9]+/)?.[0];
  assert.ok(jobId);
  await expect.poll(async () => (await submittedMessage(browser)).commandInput).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).runEnd).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).jobSettled).toBe(true);
  await expect.poll(async () => (await submittedMessage(browser, jobId)).completionNotice).toBe(true);
  const submitted = await submittedMessage(browser, jobId);
  assert.equal(submitted.found, false, 'slash command must not be queued as a user message');
  assert.ok(!submitted.tools.includes('devflow'), 'slash command must not call the devflow model tool');
  assert.ok(!submitted.tools.includes('run_workflow'), 'slash command must not call the saved workflow model tool');
  for (const fragment of expectedOutput) {
    assert.ok(submitted.completionText.includes(fragment), 'missing workflow result ' + JSON.stringify(fragment) + '; notice: ' + submitted.completionText);
  }
  await expect.poll(async () => (await submittedMessage(browser, jobId)).blank).toBe(false);
}

Then('the deep research workflow returns its result without model-mediated dispatch', async ({ e2e }) => {
  await assertDirectWorkflow(e2e.fixtures.browser, ['No claims extracted.', '"angles": 1']);
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
  await executeHostCommand(e2e.fixtures.browser, '/bdd-echo BDD saved workflow', { cwd: project });
});

Then('the project filesystem workflow returns its result without model-mediated dispatch', async ({ e2e }) => {
  await assertDirectWorkflow(e2e.fixtures.browser, ['aimock fixture loaded']);
});

When('I run deep research with the ptc preset', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/deep-research BDD scoped workflow', { agentPreset: 'ptc' });
});

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
    const completionText = events
      .filter(event => event.type === 'user/message' && event.data.source?.kind === 'tool-jobs')
      .flatMap(event => event.data.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .find(text => jobId !== undefined && text.includes('background job ' + jobId)) ?? null;
    const line = '/' + ${JSON.stringify(name)} + ' BDD UI execution';
    const queuedInput = events.some(event => event.type === 'user/message' && event.data.content?.some(block => block.type === 'text' && block.text === line));
    const dispatchTools = events.filter(event => event.type === 'tool/call' && ['devflow', 'run_workflow'].includes(event.data.name)).map(event => event.data.name);
    return {
      ok: commandRun !== undefined && commandDone !== undefined && runEnd && jobSettled && completionText !== null,
      sessionId,
      commandRun: commandRun?.data,
      commandDone: commandDone?.data,
      runStart: runStart?.data,
      runEnd,
      jobId,
      jobSettled,
      completionText,
      queuedInput,
      dispatchTools,
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
      await expect.poll(async () => (await uiCommandEvidence(e2e.fixtures.browser, name)).ok).toBe(true);
    } catch (error) {
      console.error('BDD UI command failed:', name, JSON.stringify(await uiCommandEvidence(e2e.fixtures.browser, name)));
      throw error;
    }
    console.log('BDD UI command completed:', name);
  }
});

Then('all nine DevFlow commands complete through the Web UI', async ({ e2e }) => {
  for (const name of devflowCommands) {
    const evidence = await uiCommandEvidence(e2e.fixtures.browser, name);
    assert.equal(evidence.ok, true, '/' + name + ' did not complete: ' + JSON.stringify(evidence));
    assert.equal(evidence.commandDone.kind, 'success');
    assert.equal(evidence.queuedInput, false, '/' + name + ' was queued as a user message');
    assert.deepEqual(evidence.dispatchTools, [], '/' + name + ' used model-mediated dispatch');
    const expectedOutput = name === 'deep-research'
      ? ['No claims extracted.', '"angles": 1']
      : name === 'batch'
        ? ['"status": "plan-ready"', 'aimock fixture loaded']
        : ['aimock fixture loaded'];
    for (const fragment of expectedOutput) {
      assert.ok(evidence.completionText.includes(fragment), '/' + name + ' returned the wrong result: ' + evidence.completionText);
    }
  }
});

When('I run the batch command without an approved plan', async ({ e2e }) => {
  await executeHostCommand(e2e.fixtures.browser, '/batch BDD isolated units');
});

Then('batch returns an unapproved plan without starting worktree workers', async ({ e2e }) => {
  await assertDirectWorkflow(e2e.fixtures.browser, ['"status": "plan-ready"', 'aimock fixture loaded']);
  const result = await commandResult(e2e.fixtures.browser);
  const jobId = result.text.match(/workflow-[a-z0-9]+/)?.[0];
  const submitted = await submittedMessage(e2e.fixtures.browser, jobId);
  assert.equal(submitted.agentStarts, 1, 'batch must run only the planning agent before approval');
  assert.ok(!submitted.tools.includes('create_worktree'), 'batch must not create worktrees before plan approval');
});
