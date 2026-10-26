import json
import subprocess
from pathlib import Path

from semantic_version import Version


ROOT = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True)


def read_git_file(revision):
    result = subprocess.run(
        ['git', 'show', revision],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return result.stdout if result.returncode == 0 else None


def without_version(manifest):
    return {key: value for key, value in manifest.items() if key != 'version'}


def main():
    staged_files = [
        path
        for path in git('diff', '--cached', '--name-only', '--diff-filter=ACMRD', '-z').split('\0')
        if path
    ]
    manifests = [
        f'plugins/{entry.name}/package.json'
        for entry in sorted((ROOT / 'plugins').iterdir())
        if entry.is_dir() and (entry / 'package.json').is_file()
    ]

    for manifest in manifests:
        plugin_prefix = manifest[:-len('package.json')]
        changed_files = [path for path in staged_files if path.startswith(plugin_prefix)]
        if not changed_files:
            continue

        head_text = read_git_file(f'HEAD:{manifest}')
        staged_text = read_git_file(f':{manifest}')
        # A new or deleted plugin has no previous release to bump.
        if head_text is None or staged_text is None:
            continue

        head_manifest = json.loads(head_text)
        staged_manifest = json.loads(staged_text)
        code_changed = any(path != manifest for path in changed_files)
        code_changed = code_changed or without_version(head_manifest) != without_version(staged_manifest)
        head_version = Version(head_manifest['version'])
        staged_version = Version(staged_manifest['version'])
        if not code_changed or staged_version > head_version:
            continue

        next_version = head_version.next_patch()
        manifest_path = ROOT / manifest
        # npm pkg set updates only the manifest and works with a dirty pre-commit worktree.
        subprocess.run(
            ['npm', 'pkg', 'set', f'version={next_version}'],
            cwd=manifest_path.parent,
            check=True,
            stdout=subprocess.DEVNULL,
        )

        # Stage the bump so it is part of the commit that changed the plugin.
        git('add', '--', manifest)
        print(f'{manifest}: {head_version} -> {next_version}')


if __name__ == '__main__':
    main()
