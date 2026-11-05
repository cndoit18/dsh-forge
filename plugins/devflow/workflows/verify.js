export const meta = {
  name: 'verify',
  description: '通过真实应用流程端到端验证变更，不只依赖测试或类型检查。',
  input: { hint: '[预期结果]', required: true },
}

phase('Verify')
const result = await agent(`Verify this change end to end: ${args.instruction}. Drive the real interface through its affected flow, observe success and the most relevant failure path, and do not rely on tests or typecheck alone. Use managed background jobs for owned servers, collect their output, and report exact interactions, observed behavior and unverified aspects.`)
if (result === null) throw new Error('Verification agent failed')
return result
