export const meta = {
  name: 'security-review',
  description: '审查待提交变更中的可利用安全风险，并过滤误报。',
  input: { hint: '[目标]', required: true },
}

phase('Analyze')
const candidates = await agent(`Inspect the pending diff and surrounding code for exploitable vulnerabilities introduced by the change. Cover injection, authentication, authorization, data exposure, unsafe process or filesystem behavior, and dependency or secret risks. Return candidate findings with concrete evidence. Target: ${args.instruction}`)
if (candidates === null) throw new Error('Security analysis agent failed')
phase('Adversarial review')
const result = await agent(`Independently challenge each security candidate. Exclude confidence below 8, theoretical-only issues, best-practice suggestions, pre-existing issues, and findings without a concrete attack path. Return verified findings with evidence, impact, reproduction and fix, or an explicit no-findings result. Candidates: ${JSON.stringify(candidates)}`)
if (result === null) throw new Error('Security verification agent failed')
return result
