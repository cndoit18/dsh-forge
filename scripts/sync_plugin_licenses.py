import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True)


def main():
    changed = []
    for plugin in sorted((ROOT / 'plugins').iterdir()):
        manifest = plugin / 'package.json'
        if not plugin.is_dir() or not manifest.is_file():
            continue

        metadata = json.loads(manifest.read_text())
        if metadata.get('license') != 'Apache-2.0':
            metadata['license'] = 'Apache-2.0'
            manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
            changed.append(str(manifest.relative_to(ROOT)))

        license_path = plugin / 'LICENSE'
        if not license_path.is_file() or license_path.read_bytes() != (ROOT / 'LICENSE').read_bytes():
            shutil.copyfile(ROOT / 'LICENSE', license_path)
            changed.append(str(license_path.relative_to(ROOT)))

    if changed:
        git('add', '--', *changed)
        print('Synchronized Apache-2.0 license files:')
        print('\n'.join(changed))


if __name__ == '__main__':
    main()
