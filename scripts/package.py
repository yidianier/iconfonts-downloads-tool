"""Package the unpacked Chrome extension without third-party dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
extension = root / 'extension'
version = json.loads((extension / 'manifest.json').read_text())['version']
target = root / 'dist' / f'iconpack-{version}.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(extension.rglob('*')):
        if file.is_file() and not file.name.startswith('.'):
            archive.write(file, file.relative_to(extension))
    for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md'):
        archive.write(root / name, name)
print(target)
