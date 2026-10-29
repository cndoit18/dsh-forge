phase('Run')
return await agent(`Launch and exercise this project's real application for: ${args.instruction}. Discover the documented run command, use managed background jobs for long-running processes, verify the user-facing result, and collect relevant output. Report the exact command, URL or interaction, and evidence.`)
