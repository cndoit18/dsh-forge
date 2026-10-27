#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { launcher } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'profile.json'), 'utf8'))
const args = process.argv.slice(2)
const separator = args.indexOf('--')
if (separator < 0) throw new Error('landlock-bwrap: missing command separator')

// runnerCommand supplies bwrap syntax; Landlock has no namespace equivalent.
// Keep the same filesystem effect as the upstream landlockProfileArgs policy.
const grants = ['--ro', '/', '--rw', '/dev/null']
for (let index = 0; index < separator; index++) {
  const arg = args[index]
  if (arg === '--bind' || arg === '--tmpfs') {
    const path = args[++index]
    if (arg === '--bind' && args[++index] !== path) throw new Error('landlock-bwrap: cannot remap writable paths')
    grants.push('--rw', path)
  } else if (arg === '--ro-bind' || arg === '--dev' || arg === '--proc') {
    index += 2
  } else if (arg !== '--unshare-pid' && arg !== '--die-with-parent') {
    throw new Error('landlock-bwrap: unsupported argument ' + arg)
  }
}

const result = spawnSync(launcher, [...grants, '--', ...args.slice(separator + 1)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
