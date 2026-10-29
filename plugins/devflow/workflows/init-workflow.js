phase('Explore')
const inventory = await agent(`Read the repository instructions, build and test configuration, source layout and conventions. Do not modify files. Report a concise inventory for initializing DSH-native AGENTS.md. ${args.instruction}`)
phase('Initialize')
const result = await agent(`Create or improve AGENTS.md using this repository inventory. Preserve useful existing content, use DSH-native paths and commands, keep it concise, and offer optional project skills or hooks only when useful. Do not create CLAUDE.md symlinks. Inventory: ${inventory}`)
return result
