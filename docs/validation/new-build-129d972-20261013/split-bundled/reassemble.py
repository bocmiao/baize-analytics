#!/usr/bin/env python3
"""Join raw package parts and verify SHA-256; never execute or unpack contents."""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, help='parts-manifest.json')
    parser.add_argument('--output', type=Path, help='New output filename; must not exist')
    args = parser.parse_args()
    manifest_path = args.manifest.resolve(strict=True)
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    if data.get('version') != 1 or data.get('encoding') != 'raw-byte-concatenation':
        raise ValueError('Unsupported manifest; no package contents will be executed')
    filename = data['original']['filename']
    if Path(filename).name != filename or '/' in filename or '\\' in filename:
        raise ValueError('Original filename must be a basename')
    parts = data['parts']
    if not parts or [p['sequence'] for p in parts] != list(range(1, len(parts) + 1)):
        raise ValueError('Missing or out-of-order part sequence')
    names = [p['filename'] for p in parts]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate part filename')
    for part in parts:
        name = part['filename']
        if Path(name).name != name or '/' in name or '\\' in name:
            raise ValueError('Part filename must be a basename')
        if not 0 < part['bytes'] <= 8 * 1024 * 1024:
            raise ValueError('Invalid part size')
        path = manifest_path.parent / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size != part['bytes']:
            raise ValueError('Missing or invalid part: ' + name)
    output = (args.output or manifest_path.parent / filename).absolute()
    digest = hashlib.sha256()
    count = 0
    created = False
    try:
        with output.open('xb') as destination:
            created = True
            for part in parts:
                part_digest = hashlib.sha256()
                part_bytes = 0
                with (manifest_path.parent / part['filename']).open('rb') as source:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        destination.write(chunk)
                        digest.update(chunk)
                        part_digest.update(chunk)
                        part_bytes += len(chunk)
                        count += len(chunk)
                if part_bytes != part['bytes'] or part_digest.hexdigest() != part['sha256']:
                    raise ValueError('Part checksum mismatch: ' + part['filename'])
            if count != data['original']['bytes'] or digest.hexdigest() != data['original']['sha256']:
                raise ValueError('Joined package checksum mismatch')
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    print('Verified package: ' + str(output))
    print('bytes=' + str(count) + ' SHA256=' + digest.hexdigest())
    print('No package contents were executed or unpacked.')


if __name__ == '__main__':
    main()
