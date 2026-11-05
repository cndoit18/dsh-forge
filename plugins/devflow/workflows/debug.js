export const meta = {
  name: 'debug',
  description: '根据运行时证据、日志和最小复现定位并修复问题。',
  input: { hint: '[问题现象]', required: true },
}

phase('Reproduce')
const evidence = await agent(`Investigate this issue from runtime evidence: ${args.instruction}. Inspect logs and actual execution, reproduce the smallest failing case, identify the responsible code, and do not edit yet. Return evidence, root-cause hypothesis, and what would disprove it.`)
if (evidence === null) throw new Error('Debug evidence agent failed')
phase('Fix')
const result = await agent(`Fix the root cause with the smallest change. Add or strengthen the failing regression test first, run focused tests, and report observed before/after behavior and remaining uncertainty. Evidence: ${JSON.stringify(evidence)}`)
if (result === null) throw new Error('Debug fix agent failed')
return result
