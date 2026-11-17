import { parse } from 'acorn'

const META_KEYS = new Set(['name', 'description', 'whenToUse', 'phases', 'input'])

function invalidMeta(path, node) {
  return new Error(`${path}: workflow meta must contain only JSON literals; found ${node.type}`)
}

/** Decode JSON-compatible AST nodes without evaluating any workflow source. */
function readMeta(node, path) {
  if (node.type === 'Literal') {
    if (node.regex || typeof node.value === 'bigint'
      || (typeof node.value === 'number' && !Number.isFinite(node.value))) throw invalidMeta(path, node)
    return node.value
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    const value = node.quasis[0].value.cooked
    if (typeof value !== 'string') throw invalidMeta(path, node)
    return value
  }
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
    const value = readMeta(node.argument, path)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidMeta(path, node)
    return node.operator === '-' ? -value : value
  }
  if (node.type === 'ArrayExpression') {
    if (node.elements.some(element => element === null)) throw invalidMeta(path, node)
    return node.elements.map(element => readMeta(element, path))
  }
  if (node.type === 'ObjectExpression') {
    const result = {}
    for (const property of node.properties) {
      if (property.type !== 'Property' || property.kind !== 'init'
        || property.method || property.computed || property.shorthand) throw invalidMeta(path, property)
      let key
      if (property.key.type === 'Identifier') key = property.key.name
      else if (property.key.type === 'Literal' && typeof property.key.value === 'string') key = property.key.value
      else if (property.key.type === 'Literal' && typeof property.key.value === 'number'
        && Number.isFinite(property.key.value)) key = String(property.key.value)
      else throw invalidMeta(path, property.key)
      Object.defineProperty(result, key, {
        value: readMeta(property.value, path),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return result
  }
  throw invalidMeta(path, node)
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
  const meta = readMeta(binding.init, path)
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
