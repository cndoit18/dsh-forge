import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect } from 'e2e';
import { Then, When } from './fixtures.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args]);
}

async function commit(cwd: string, message: string) {
  await git(cwd, 'add', '.');
  await git(cwd, '-c', 'user.name=BDD', '-c', 'user.email=bdd@example.com', 'commit', '-m', message);
}

When('I install a Git Agent Plugin with nested submodules through the UI', async ({ e2e }) => {
  const temporary = await mkdtemp(join(tmpdir(), 'bdd-agent-submodules-'));
  const repository = join(temporary, 'repository');
  const child = join(temporary, 'child');
  const nested = join(temporary, 'nested');
  try {
    const files = [
      [repository, 'plugin.json', JSON.stringify({
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'bdd-submodule-demo',
        version: '1.0.0',
      })],
      [child, 'child.txt', 'child.txt\n'],
      [nested, 'nested.txt', 'nested.txt\n'],
    ] as const;
    for (const [directory, name, contents] of files) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, name), contents);
      await git(directory, 'init', '-b', 'main');
      await commit(directory, 'initial');
    }
    await git(child, '-c', 'protocol.file.allow=always', 'submodule', 'add', `file://${nested}`, 'nested');
    await commit(child, 'add nested');
    await git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', `file://${child}`, 'vendor/child');
    await commit(repository, 'add child');

    let previousFileAllow: string | undefined;
    try {
      previousFileAllow = (await git(repository, 'config', '--global', '--get', 'protocol.file.allow')).stdout.trim();
    } catch (error) {
      if ((error as { code?: number }).code !== 1) throw error;
    }
    // The BDD container uses local remotes; restore Git's protected transport policy afterwards.
    await git(repository, 'config', '--global', 'protocol.file.allow', 'always');
    try {
      const spec = `file://${repository}`;
      const screen = e2e.fixtures.screen;
      await screen.getByRole('button', { name: 'Account menu', exact: true }).tap();
      await screen.getByRole('menuitem', { name: 'Settings', exact: true }).tap();
      const settings = screen.getByRole('dialog', { name: 'Settings', exact: true });
      await settings.getByRole('button', { name: 'Agent plugins', exact: true }).tap();
      await settings.getByRole('button', { name: 'Install from Git', exact: true }).tap();
      const installDialog = screen.getByRole('dialog', { name: 'Install Agent Plugin from Git', exact: true });
      await installDialog.getByRole('textbox', { name: 'Install Agent Plugin from Git', exact: true }).fill(spec);
      await installDialog.getByRole('button', { name: 'Install from Git', exact: true }).tap();
      await expect(settings.getByRole('button', { name: /bdd-submodule-demo/ })).toBeVisible();
    } finally {
      if (previousFileAllow === undefined) {
        await git(repository, 'config', '--global', '--unset', 'protocol.file.allow');
      } else {
        await git(repository, 'config', '--global', 'protocol.file.allow', previousFileAllow);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

Then('the Agent Plugins UI shows the nested submodule files', async ({ e2e }) => {
  const settings = e2e.fixtures.screen.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: /bdd-submodule-demo/ }).tap();
  await settings.getByRole('tab', { name: 'Files', exact: true }).tap();
  await settings.getByRole('button', { name: '目录 vendor', exact: true }).tap();
  await settings.getByRole('button', { name: '目录 vendor/child', exact: true }).tap();
  await settings.getByRole('button', { name: '目录 vendor/child/nested', exact: true }).tap();
  await expect(settings.getByRole('button', { name: '文件 vendor/child/child.txt', exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: '文件 vendor/child/nested/nested.txt', exact: true })).toBeVisible();
});

Then('the Agent Plugin contains recursive submodule files without Git metadata', async () => {
  const home = process.env.HOME;
  if (!home) throw new Error('HOME is required');
  const root = join(home, '.agents', 'plugins', 'bdd-submodule-demo');
  assert.equal(await readFile(join(root, 'vendor', 'child', 'child.txt'), 'utf8'), 'child.txt\n');
  assert.equal(await readFile(join(root, 'vendor', 'child', 'nested', 'nested.txt'), 'utf8'), 'nested.txt\n');
  await assert.rejects(stat(join(root, '.git')), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, 'vendor', 'child', '.git')), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, 'vendor', 'child', 'nested', '.git')), { code: 'ENOENT' });
});
