import { readProfileManifest, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { writePluginEnabled } from '/workspace/third_party/deepseek-harness/packages/boot/plugin-manager/src/patch.ts'

const dir = '/root/.dsh/profiles/web'
const manifest = readProfileManifest('dsh', dir)
const bundles = new Set(manifest.dsh.profile.bundles)
bundles.delete('@deepseek-ai/dsh-experimental-tool-worktree')
bundles.delete('@deepseek-ai/dsh-experimental-worktree')
writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh.profile, bundles: [...bundles] } } })
const profile = { dir, patchPath: dir + '/cordis.patch.yml', startedBundles: [...bundles] }
await writePluginEnabled(profile, 'worktree', '@deepseek-ai/dsh-experimental-worktree', true)
