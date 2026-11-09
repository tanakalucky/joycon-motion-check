"""Read one bounded JSON file without extracting any archive paths."""
import io
import sys
import stat
import zipfile

archive = sys.stdin.buffer.read(30 * 1024 * 1024 + 1)
if len(archive) > 30 * 1024 * 1024:
    raise ValueError('Archive too large')
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    entries = bundle.infolist()
    if len(entries) != 1 or entries[0].filename != 'site.json':
        raise ValueError('Expected only site.json')
    entry = entries[0]
    mode = entry.external_attr >> 16
    if stat.S_IFMT(mode) not in (0, stat.S_IFREG):
        raise ValueError('Only a regular file is allowed')
    if entry.file_size > 30 * 1024 * 1024 or entry.is_dir():
        raise ValueError('Invalid payload size or type')
    sys.stdout.buffer.write(bundle.read(entry))
