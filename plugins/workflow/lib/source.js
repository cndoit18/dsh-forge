import { parse } from 'acorn'
import { runInNewContext } from 'node:vm'

const META_KEYS = new Set(['name', 'description', 'whenToUse', 'phases', 'input'])
const META_TIMEOUT_MS = 100

/** Evaluate only the literal metadata expression, never the orchestration body. */
function readMeta(literal) {
  const serialized = runInNewContext(`JSON.stringify(${literal})`, Object.create(null), {
    timeout: META_TIMEOUT_MS,
    contextCodeGeneration: { strings: false, wasm: false },
  })
  if (typeof serialized !== 'string') throw new Error('workflow meta must be JSON-serializable')
  return JSON.parse(serialized)
}

export function parseWorkflowSource(source, path = 'workflow.js') {
  if (typeof source !== 'string') throw new TypeError('workflow source must be a string')
  let program
  try {
    program = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    })
  } catch (error) {
    throw new Error(`${path}: invalid workflow JavaScript: ${String(error)}`, { cause: error })
  }
  const [statement] = program.body
  if (statement?.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
    throw new Error(`${path}: export const meta must be the first statement`)
  }
  const declaration = statement.declaration
  if (declaration.kind !== 'const' || declaration.declarations.length !== 1) {
    throw new Error(`${path}: export const meta must declare one constant`)
  }
  const [binding] = declaration.declarations
  if (binding.id.type !== 'Identifier' || binding.id.name !== 'meta') {
    throw new Error(`${path}: export const meta must be the first statement`)
  }
  if (binding.init?.type !== 'ObjectExpression') {
    throw new Error(`${path}: workflow meta must be an object literal`)
  }
  const literal = source.slice(binding.init.start, binding.init.end)
  const meta = readMeta(literal)
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new Error(`${path}: workflow meta must be an object`)
  }
  for (const key of Object.keys(meta)) {
    if (!META_KEYS.has(key)) throw new Error(`${path}: unsupported workflow meta field "${key}"`)
  }
  const input = meta.input === undefined
    ? undefined
    : {
        hint: meta.input.hint ?? '[输入]',
        ...meta.input.required === undefined ? {} : { required: meta.input.required },
      }
  delete meta.input
  return { meta, input, script: source.slice(statement.end) }
}
