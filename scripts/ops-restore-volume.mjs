import fs from 'node:fs';
import path from 'node:path';

export function restoreVolumeFiles(source, target, uid, gid) {
  if (![uid, gid].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid restore ownership');
  const independent = new Set(['tombstones.jsonl', 'tombstones.watermark.json']);
  const entries = fs.readdirSync(source);
  for (const name of independent) {
    if (!fs.lstatSync(path.join(source, name)).isFile()) throw new Error('Backup journal must be a regular file');
  }
  // Preflight the entire source without following symlinks before mutating data.
  function validate(file) {
    const info = fs.lstatSync(file);
    if (info.isDirectory()) for (const name of fs.readdirSync(file)) validate(path.join(file, name));
    else if (info.isFile()) fs.accessSync(file, fs.constants.R_OK);
    else if (!info.isSymbolicLink()) throw new Error('Unsupported backup file type');
  }
  for (const name of entries) validate(path.join(source, name));
  const journalPath = path.join(source, 'tombstones.jsonl');
  const journalFd = fs.openSync(journalPath, 'r');
  fs.closeSync(journalFd);
  function own(file) {
    const info = fs.lstatSync(file);
    if (info.isDirectory()) for (const name of fs.readdirSync(file)) own(path.join(file, name));
    fs.lchownSync(file, uid, gid);
  }
  for (const name of fs.readdirSync(target)) if (!independent.has(name)) fs.rmSync(path.join(target, name), {recursive: true, force: true});
  for (const name of entries) if (!independent.has(name) && name !== 'restore-backup-tombstones.jsonl') {
    const destination = path.join(target, name);
    fs.cpSync(path.join(source, name), destination, {recursive: true, preserveTimestamps: true});
    own(destination);
  }
  const backupJournal = path.join(target, 'restore-backup-tombstones.jsonl');
  fs.copyFileSync(journalPath, backupJournal);
  fs.chmodSync(backupJournal, 0o600);
  own(backupJournal);
}
