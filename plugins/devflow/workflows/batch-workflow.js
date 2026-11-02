// Plan approval is required before creating independent worktrees.
const continuing = args.instruction === 'continue' || args.instruction.startsWith('continue ')
if (!continuing) {
  phase('Plan')
  const plan = await agent(`Plan this large change: ${args.instruction}

Work read-only until the plan is approved through exit_plan_mode. Inspect the repository, current changes and verification commands. Decompose the change into 5-30 independent units with explicit non-overlapping file ownership; for smaller work use fewer units. Include exact files, shared conventions, and a concrete end-to-end recipe. Plan against HEAD unless the user chooses another baseline: create_worktree does not copy uncommitted changes. Do not create worktrees or edit files before approval.`)
  if (plan === null) throw new Error('Batch planning agent failed')
  return { status: 'plan-ready', plan, next: 'After approval, use /batch continue with the approved plan to start isolated workers.' }
}
const approvedPlan = args.instruction.slice('continue'.length).trim()
if (!approvedPlan) throw new Error('Approved plan is required after /batch continue.')
const units = await agent(`Read this approved implementation plan and return only its independent units with exact non-overlapping file ownership and verification recipe. Do not edit or create worktrees. Plan: ${approvedPlan}`, {
  schema: {
    type: 'object', required: ['units', 'e2e'],
    properties: {
      e2e: { type: 'string' },
      units: { type: 'array', items: { type: 'object', required: ['id', 'files', 'instruction'], properties: {
        id: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' },
      } } },
    },
  },
})
if (units === null) throw new Error('Unit parser agent failed')
if (units.units.length === 0) throw new Error('Approved plan contains no independent units.')
phase('Implement')
const results = await parallel(units.units.map(unit => () => agent(`Implement only this approved unit: ${JSON.stringify(unit)}. First call create_worktree with a unique name. Use its returned absolute path for every file operation and command; never edit the source worktree. Run focused tests and this end-to-end recipe: ${units.e2e}. Do not commit, push or create a PR. Report worktree path, branch, changed files, test results and remaining failures.`)))
if (results.some(result => result === null)) throw new Error('One or more implementation agents failed')
return { status: 'implemented', results }
