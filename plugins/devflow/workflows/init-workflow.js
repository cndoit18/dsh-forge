export const meta = {
  name: 'init',
  description: '初始化或改进项目 AGENTS.md 指令与可复用技能。',
  input: { hint: '[项目偏好]', required: false },
}

phase('Explore')
const inventory = await agent(`Read the repository instructions, build and test configuration, source layout and conventions. Do not modify files. Report a concise inventory for initializing DSH-native AGENTS.md. ${args.instruction}`)
if (inventory === null) throw new Error('Repository inventory agent failed')
phase('Initialize')
const result = await agent(`Create or improve AGENTS.md using this repository inventory. Preserve useful existing content, use DSH-native paths and commands, keep it concise, and offer optional project skills or hooks only when useful. Do not create CLAUDE.md symlinks. Inventory: ${inventory}`)
if (result === null) throw new Error('Initialization agent failed')
return result
