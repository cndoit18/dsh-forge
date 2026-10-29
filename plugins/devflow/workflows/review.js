const input = args.instruction.trim()
const requestedStrength = input.split(/\s+/, 1)[0]
const strength = ['low', 'medium', 'high', 'max', 'ultra'].includes(requestedStrength) ? requestedStrength : 'low'
phase('Review')
const review = await agent(`Review strength: ${strength}. Review the change set for correctness bugs, regressions, error handling, concurrency and lifecycle issues, and missing tests. Inspect git status, git diff and surrounding contracts. Return structured findings with file, line, severity, confidence, rationale and suggested fix. Prioritize newly introduced issues, not style. Optional ultra mode runs local multi-agent review, not cloud ultrareview. Input: ${args.instruction}`)
return review
