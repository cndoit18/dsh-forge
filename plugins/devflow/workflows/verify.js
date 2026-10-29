phase('Verify')
return await agent(`Verify this change end to end: ${args.instruction}. Drive the real interface through its affected flow, observe success and the most relevant failure path, and do not rely on tests or typecheck alone. Use managed background jobs for owned servers, collect their output, and report exact interactions, observed behavior and unverified aspects.`)
