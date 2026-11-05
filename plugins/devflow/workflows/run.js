export const meta = {
  name: 'run',
  description: '启动并实际操作项目，通过真实用户入口验证变更。',
  input: { hint: '[运行任务]', required: true },
}

phase('Run')
const result = await agent(`Launch and exercise this project's real application for: ${args.instruction}. Discover the documented run command, use managed background jobs for long-running processes, verify the user-facing result, and collect relevant output. Report the exact command, URL or interaction, and evidence.`)
if (result === null) throw new Error('Run agent failed')
return result
