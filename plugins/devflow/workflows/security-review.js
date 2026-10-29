phase('Analyze')
const candidates = await agent(`Inspect the pending diff and surrounding code for exploitable vulnerabilities introduced by the change. Cover injection, authentication, authorization, data exposure, unsafe process or filesystem behavior, and dependency or secret risks. Return candidate findings with concrete evidence. Target: ${args.instruction}`)
phase('Adversarial review')
return await agent(`Independently challenge each security candidate. Exclude confidence below 8, theoretical-only issues, best-practice suggestions, pre-existing issues, and findings without a concrete attack path. Return verified findings with evidence, impact, reproduction and fix, or an explicit no-findings result. Candidates: ${JSON.stringify(candidates)}`)
