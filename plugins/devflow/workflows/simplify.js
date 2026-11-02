phase('Review')
const findings = await parallel(['Reuse', 'Simplification', 'Efficiency', 'Altitude'].map(angle => () => agent(`Review the current diff from the ${angle} angle. Report concrete file, line, summary and maintenance or performance cost; do not change files. Target: ${args.instruction}`)))
if (findings.some(finding => finding === null)) throw new Error('Simplify review agents failed')
phase('Apply')
const result = await agent(`Deduplicate these four review angles, apply only justified cleanup fixes without changing intended behavior, run focused tests, and report fixes and skips. If nothing improves, leave code unchanged. Findings: ${JSON.stringify(findings)}`)
if (result === null) throw new Error('Simplify apply agent failed')
return result
