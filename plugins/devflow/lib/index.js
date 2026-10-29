import { readFile } from 'node:fs/promises'

export const name = 'devflow'
export const inject = ['commands', 'agentPresets']

const descriptions = {
  'deep-research': '并行搜索并提取证据，每条论断三票核验，最后汇总带引用的结论。',
  batch: '规划大型变更，经批准后让独立单元在隔离 worktree 中并行实施。',
  init: '初始化或改进项目 AGENTS.md 指令与可复用技能。',
  review: '审查 diff、PR、分支或路径中的正确性缺陷与回归。',
  simplify: '从复用、简化、效率和抽象层级审查代码，并实施合理修正。',
  'security-review': '审查待提交变更中的可利用安全风险，并过滤误报。',
  debug: '根据运行时证据、日志和最小复现定位并修复问题。',
  run: '启动并实际操作项目，通过真实用户入口验证变更。',
  verify: '通过真实应用流程端到端验证变更，不只依赖测试或类型检查。',
}
const hints = {
  'deep-research': '<研究问题>', batch: '<大型变更>', init: '[项目偏好]',
  review: '[审查强度] [--fix] [--comment] [目标]', simplify: '[目标]',
  'security-review': '[目标]', debug: '[问题现象]', run: '[运行任务]', verify: '[预期结果]',
}
const scriptFile = name => name === 'init' ? 'init-workflow' : name === 'batch' ? 'batch-workflow' : name
const metaFor = name => ({
  name,
  description: descriptions[name],
  phases: name === 'deep-research'
    ? ['范围界定', '并行搜索', '抓取与提取', '三票核验', '综合结论'].map(title => ({ title }))
    : undefined,
})

export function apply(ctx) {
  for (const [name, description] of Object.entries(descriptions)) {
    ctx.effect(() => ctx.commands.register({
      name,
      description,
      input: { hint: hints[name] },
      handler: async ({ agent, rawInput, signal }) => {
        if (!rawInput.trim() && name !== 'init') {
          return { kind: 'error', text: `/${name} requires input. ${hints[name]}` }
        }
        const workflowEngine = ctx.agentPresets.serviceFor(agent, 'workflowEngine')
        if (!workflowEngine) {
          return { kind: 'error', text: `/${name} requires an Agent preset with Workflow support.` }
        }
        const script = await readFile(new URL(`../workflows/${scriptFile(name)}.js`, import.meta.url), 'utf8')
        const run = workflowEngine.start({
          script,
          meta: metaFor(name),
          args: name === 'deep-research' ? { question: rawInput } : { instruction: rawInput },
          parent: agent,
          signal,
        })
        const result = await run.result
        await run.dispose()
        if (result.stopReason !== 'completed') return { kind: 'error', text: `/${name} failed: ${result.error ?? result.stopReason}` }
        return { kind: 'success', text: typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2) }
      },
    }), `devflow: ${name}`)
  }
}
