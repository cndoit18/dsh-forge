import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { invalidAgentPlugin, isMissingPath } from './validation.js'

/** Whether target resolves lexically inside root, including root itself. */
export function pathInside(root, target) {
  const child = relative(root, target)
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
}

/** Resolve an existing path and require it to remain inside the resolved root. */
export async function resolveExistingInside(root, candidate) {
  const resolvedRoot = await realpath(root)
  const resolvedCandidate = await realpath(candidate)
  if (!pathInside(resolvedRoot, resolvedCandidate)) {
    throw invalidAgentPlugin('package path resolves outside the plugin root', candidate)
  }
  return resolvedCandidate
}

/** Resolve a launch path even when its final segments do not exist yet. */
export async function resolveLaunchInside(root, candidate) {
  const resolvedRoot = await realpath(root)
  const resolvedCandidate = await canonicalizeWithMissing(candidate)
  if (!pathInside(resolvedRoot, resolvedCandidate)) {
    throw invalidAgentPlugin('launch path resolves outside its allowed root', candidate)
  }
  return resolvedCandidate
}

async function canonicalizeWithMissing(candidate) {
  const absolute = resolve(candidate)
  const suffix = []
  let current = absolute
  while (true) {
    try {
      const resolved = await realpath(current)
      return suffix.length === 0 ? resolved : resolve(resolved, ...suffix)
    } catch (error) {
      if (!isMissingPath(error)) throw error
      const parent = dirname(current)
      if (parent === current) throw error
      suffix.unshift(basename(current))
      current = parent
    }
  }
}
