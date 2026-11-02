phase('Run')
const result = await agent(`Launch and exercise this project's real application for: ${args.instruction}. Discover the documented run command, use managed background jobs for long-running processes, verify the user-facing result, and collect relevant output. Report the exact command, URL or interaction, and evidence.`)
if (result === null) throw new Error('Run agent failed')
return result
