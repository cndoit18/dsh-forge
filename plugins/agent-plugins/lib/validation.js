import Ajv2020 from 'ajv/dist/2020.js'
import { validateHeaderName, validateHeaderValue } from 'node:http'
import { isIP } from 'node:net'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pluginSchema = require('../schemas/1.0.0/plugin.schema.json')
const mcpSchema = require('../schemas/1.0.0/mcp.schema.json')

export const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
export const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
export const INVALID_AGENT_PLUGIN = 'AGENT_PLUGIN_INVALID'

const MANIFEST_FIELDS = new Set([
  '$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository',
  'license', 'keywords', 'extensions',
])
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ajv = new Ajv2020({ strict: false, allErrors: true })
const validateManifestSchema = ajv.compile(pluginSchema)
ajv.addSchema(mcpSchema)
const validateMcpRootSchema = ajv.compile({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    $schema: { const: MCP_SCHEMA },
    mcpServers: { type: 'object' },
  },
  required: ['$schema', 'mcpServers'],
  additionalProperties: false,
})
const validateMcpServerSchema = ajv.getSchema(`${MCP_SCHEMA}#/$defs/server`)

/** Create one validation failure suitable for isolated component reporting. */
export function invalidAgentPlugin(message, path) {
  const error = new Error(path ? `${path}: ${message}` : message)
  error.code = INVALID_AGENT_PLUGIN
  error.path = path
  return error
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isMissingPath(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function schemaMessage(validate) {
  return ajv.errorsText(validate.errors, { separator: '; ', maxErrors: 3 })
}

/** Validate and sanitize plugin.json, including the two non-fatal exceptions. */
export function validateManifest(value, path) {
  if (!isPlainObject(value)) throw invalidAgentPlugin('plugin.json must contain an object', path)
  const manifest = { ...value }
  const diagnostics = []
  for (const key of Object.keys(manifest)) {
    if (MANIFEST_FIELDS.has(key)) continue
    diagnostics.push({ component: 'manifest', path, message: `ignored unknown manifest field ${JSON.stringify(key)}` })
    delete manifest[key]
  }
  if (Object.hasOwn(manifest, 'extensions') && !isPlainObject(manifest.extensions)) {
    diagnostics.push({ component: 'manifest', path, message: 'ignored non-object extensions field' })
    delete manifest.extensions
  }
  const extensions = manifest.extensions
  if (extensions !== undefined) delete manifest.extensions
  if (!validateManifestSchema(manifest)) {
    throw invalidAgentPlugin(`invalid plugin.json: ${schemaMessage(validateManifestSchema)}`, path)
  }
  if (extensions !== undefined) manifest.extensions = extensions
  return { manifest, diagnostics }
}

/** Validate the MCP document envelope without rejecting independent server entries. */
export function validateMcpDocument(value, manifestSchema, path) {
  if (!validateMcpRootSchema(value)) {
    throw invalidAgentPlugin(`invalid mcp.json: ${schemaMessage(validateMcpRootSchema)}`, path)
  }
  if (schemaVersion(value.$schema) !== schemaVersion(manifestSchema)) {
    throw invalidAgentPlugin('plugin.json and mcp.json target different Agent Plugins versions', path)
  }
  if (!isPlainObject(value.mcpServers)) throw invalidAgentPlugin('mcpServers must be an object', path)
}

function schemaVersion(value) {
  return /^https:\/\/agent-plugins\.org\/schemas\/([^/]+)\//.exec(value)?.[1]
}

/** Validate one MCP server entry and its transport-level URL/header semantics. */
export function validateMcpServer(name, value, path) {
  if (!validateMcpServerSchema(value)) {
    throw invalidAgentPlugin(`invalid MCP server ${JSON.stringify(name)}: ${schemaMessage(validateMcpServerSchema)}`, path)
  }
  if (value.type === 'stdio') {
    if (!value.command.startsWith('./') && /[\\/]/.test(value.command)) {
      throw invalidAgentPlugin(`MCP server ${JSON.stringify(name)} command must be a bare executable or ./ plugin-relative path`, path)
    }
    return
  }
  validateRemoteUrl(value.url, path)
  validateHeaders(value.headers, path)
}

function validateRemoteUrl(value, path) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw invalidAgentPlugin('MCP endpoint must be an absolute HTTP(S) URL', path)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw invalidAgentPlugin('MCP endpoint must be HTTP(S), without user information or a fragment', path)
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw invalidAgentPlugin('non-loopback MCP endpoints must use HTTPS', path)
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost') return true
  const normalized = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  const family = isIP(normalized)
  return (family === 4 && normalized.startsWith('127.')) || (family === 6 && normalized === '::1')
}

function validateHeaders(headers = {}, path) {
  if (!isPlainObject(headers)) throw invalidAgentPlugin('MCP headers must be an object', path)
  const names = new Set()
  for (const [name, value] of Object.entries(headers)) {
    try {
      validateHeaderName(name)
      validateHeaderValue(name, value)
    } catch (error) {
      throw invalidAgentPlugin(`invalid MCP header: ${errorMessage(error)}`, path)
    }
    const normalized = name.toLowerCase()
    if (names.has(normalized)) throw invalidAgentPlugin(`duplicate MCP header ${JSON.stringify(name)}`, path)
    names.add(normalized)
  }
}

/** Parse and validate one SKILL.md document against the Agent Skills contract. */
export function parseSkillDocument(raw, expectedName, path) {
  const { data, body } = parseFrontmatter(raw, path)
  const name = requiredString(data, 'name', 64, path)
  if (!SKILL_NAME.test(name) || name !== expectedName) {
    throw invalidAgentPlugin(`skill name ${JSON.stringify(name)} must be kebab-case and match parent directory ${JSON.stringify(expectedName)}`, path)
  }
  const description = requiredString(data, 'description', 1024, path)
  const result = {
    name,
    description,
    content: body.trim(),
  }
  if (Object.hasOwn(data, 'license')) result.license = optionalString(data, 'license', undefined, path)
  if (Object.hasOwn(data, 'compatibility')) result.compatibility = optionalString(data, 'compatibility', 500, path)
  if (Object.hasOwn(data, 'allowed-tools')) result.allowedTools = optionalString(data, 'allowed-tools', undefined, path)
  if (Object.hasOwn(data, 'metadata')) {
    if (!isPlainObject(data.metadata)) {
      throw invalidAgentPlugin('skill metadata must be a map', path)
    }
    // Preserve provider-owned extension data for the DSH skill registry; its semantics are not interpreted here.
    result.metadata = { ...data.metadata }
  }
  return result
}

function requiredString(data, key, maximum, path) {
  const value = data[key]
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw invalidAgentPlugin(`skill ${key} must be a string of 1-${maximum} characters`, path)
  }
  return value
}

function optionalString(data, key, maximum, path) {
  const value = data[key]
  if (typeof value !== 'string' || value.length < 1 || (maximum !== undefined && value.length > maximum)) {
    throw invalidAgentPlugin(`skill ${key} has an invalid string value`, path)
  }
  return value
}

function parseFrontmatter(raw, path) {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0 || raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') {
    throw invalidAgentPlugin('SKILL.md requires YAML frontmatter', path)
  }
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === '---') {
      const yamlText = raw.slice(start, lineStart)
      let data
      try {
        data = parseYaml(yamlText)
      } catch (error) {
        throw invalidAgentPlugin(`invalid YAML frontmatter: ${errorMessage(error)}`, path)
      }
      if (!isPlainObject(data)) throw invalidAgentPlugin('skill frontmatter must be an object', path)
      return { data, body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1) }
    }
    if (nextNewline < 0) break
    lineStart = nextNewline + 1
  }
  throw invalidAgentPlugin('SKILL.md frontmatter has no closing delimiter', path)
}

import { parse as parseYaml } from 'yaml'
