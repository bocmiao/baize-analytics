#!/usr/bin/env python3
"""Restore one verified Baize archive; never install or overwrite files."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import tarfile


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def restore(package, parts_dir, output_dir, manifest):
    entries = json.loads(manifest.read_text(encoding='utf-8'))['packages']
    selected = [entry for entry in entries if entry['file'] == package]
    if len(selected) != 1 or Path(package).name != package:
        raise ValueError('Choose an exact archive filename from SPLIT_MANIFEST.json')
    entry = selected[0]
    destination = output_dir / package
    if destination.exists():
        raise FileExistsError('Output already exists; no file was overwritten')
    for number, part in enumerate(entry['parts'], 1):
        if part['file'] != package + f'.part{number:03d}':
            raise ValueError('Part order/name is invalid')
        path = parts_dir / part['file']
        if not path.is_file() or path.stat().st_size != part['bytes'] or digest(path) != part['sha256']:
            raise ValueError('Missing or corrupt part: ' + part['file'])
    temporary = output_dir / (package + '.assembling')
    if temporary.exists():
        raise FileExistsError('An assembly file exists; preserve it and inspect before retrying')
    complete = hashlib.sha256()
    with temporary.open('xb') as output:
        for part in entry['parts']:
            with (parts_dir / part['file']).open('rb') as source:
                while block := source.read(1024 * 1024):
                    output.write(block)
                    complete.update(block)
        output.flush()
        os.fsync(output.fileno())
    if temporary.stat().st_size != entry['bytes'] or complete.hexdigest() != entry['sha256']:
        raise ValueError('Archive SHA256 mismatch; assembly preserved, no output published')
    with gzip.open(temporary, 'rb') as source:
        while source.read(1024 * 1024):
            pass
    with tarfile.open(temporary, 'r:gz') as archive:
        for _member in archive:
            pass
    # Atomic, no-replace publication on Linux and Windows. Preserve originals.
    os.link(temporary, destination)
    temporary.unlink()
    return entry['sha256']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', help='Exact .tar.gz filename from the manifest')
    parser.add_argument('--parts-dir', type=Path, default=Path('.'))
    parser.add_argument('--output-dir', type=Path, default=Path('.'))
    arguments = parser.parse_args()
    try:
        value = restore(arguments.package, arguments.parts_dir, arguments.output_dir,
                        Path(__file__).with_name('SPLIT_MANIFEST.json'))
        print('Verified archive restored: ' + arguments.package + '\nSHA256 ' + value)
    except (OSError, ValueError, EOFError, tarfile.TarError) as error:
        parser.exit(1, 'Stopped: ' + str(error) + '\n')
