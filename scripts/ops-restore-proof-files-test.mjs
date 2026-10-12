import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {restoreProofFileOwnership} from './ops-restore-proof-files.mjs';
assert.equal(process.getuid(), 0, 'Run in an isolated root test container; no host privilege changes');
let sequence = 0;
function fixture(uid = 1000, gid = 1000) {
  const stage = `/tmp/baize-retention-check-${process.pid}-${++sequence}`;
  fs.mkdirSync(stage, {mode: 0o700});
  fs.mkdirSync(stage + '/history', {mode: 0o700});
  fs.chownSync(stage, uid, gid); fs.chownSync(stage + '/history', uid, gid);
  const files = ['index.json', 'history/manifest.json', 'replay-retention-proof.json'].map(name => stage + '/' + name);
  for (const file of files) { fs.writeFileSync(file, '{}', {mode: 0o600}); fs.chownSync(file, 2000, 2000); }
  return {stage, files, uid, gid, cleanup: () => fs.rmSync(stage, {recursive: true, force: true})};
}
for (const [uid, gid] of [[1000, 1000], [1001, 1002]]) test(`actual UID ${uid}/GID ${gid} can read private copied proofs`, () => {
  const f = fixture(uid, gid);
  try {
    const read = () => spawnSync(process.execPath, ['-e', 'for(const p of process.argv.slice(1))require("fs").readFileSync(p)', ...f.files], {uid, gid});
    assert.notEqual(read().status, 0);
    restoreProofFileOwnership(f.stage, uid, gid);
    for (const file of f.files) { const s = fs.statSync(file); assert.equal(s.uid, uid); assert.equal(s.gid, gid); assert.equal(s.mode & 0o777, 0o600); }
    assert.equal(read().status, 0);
  } finally { f.cleanup(); }
});
test('copied file symlink rejected; outside owner/mode and earlier proofs unchanged', () => {
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-outside-'));
  try {
    const external = outside + '/outside.json'; fs.writeFileSync(external, '{}', {mode: 0o640}); fs.chownSync(external, 2000, 2000);
    fs.unlinkSync(f.files[2]); fs.symlinkSync(external, f.files[2]);
    assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, f.gid), {code: 'ELOOP'});
    for (const file of [external, ...f.files.slice(0, 2)]) assert.equal(fs.statSync(file).uid, 2000);
    assert.equal(fs.statSync(external).mode & 0o777, 0o640);
    const cli = spawnSync(process.execPath, ['scripts/ops-restore-proof-files.mjs', f.stage, String(f.uid), String(f.gid)], {encoding: 'utf8'});
    assert.notEqual(cli.status, 0); assert(!cli.stdout.includes('verified'));
  } finally { f.cleanup(); fs.rmSync(outside, {recursive: true, force: true}); }
});
test('history directory symlink rejected without changing outside file', () => {
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-outside-'));
  try {
    fs.writeFileSync(outside + '/manifest.json', '{}', {mode: 0o640}); fs.chownSync(outside + '/manifest.json', 2000, 2000);
    fs.rmSync(f.stage + '/history', {recursive: true}); fs.symlinkSync(outside, f.stage + '/history');
    assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, f.gid));
    assert.equal(fs.statSync(outside + '/manifest.json').uid, 2000);
    assert.equal(fs.statSync(outside + '/manifest.json').mode & 0o777, 0o640);
  } finally { f.cleanup(); fs.rmSync(outside, {recursive: true, force: true}); }
});
test('stage symlink rejected without following directory', () => {
  const f = fixture(), link = `/tmp/baize-retention-check-${process.pid}-${++sequence}`;
  try { fs.symlinkSync(f.stage, link); assert.throws(() => restoreProofFileOwnership(link, f.uid, f.gid)); assert.equal(fs.statSync(f.files[0]).uid, 2000); }
  finally { fs.rmSync(link, {force: true}); f.cleanup(); }
});
test('hard link rejected before any proof ownership changes', () => {
  const f = fixture();
  try { fs.linkSync(f.files[2], f.stage + '/linked.json'); assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, f.gid), /hard-linked/); for (const file of f.files) assert.equal(fs.statSync(file).uid, 2000); }
  finally { f.cleanup(); }
});
test('directory input rejected as a nonregular proof', () => {
  const f = fixture();
  try { fs.unlinkSync(f.files[2]); fs.mkdirSync(f.files[2]); assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, f.gid), /regular file/); assert.equal(fs.statSync(f.files[0]).uid, 2000); }
  finally { f.cleanup(); }
});
test('unexpected path or application identity rejected', () => {
  const f = fixture();
  try { assert.throws(() => restoreProofFileOwnership(f.stage + '/../', f.uid, f.gid)); assert.throws(() => restoreProofFileOwnership(f.stage, 1001, f.gid)); assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, 1001)); assert.equal(fs.statSync(f.files[0]).uid, 2000); }
  finally { f.cleanup(); }
});
test('missing final proof rejects without partial ownership changes or leaked FDs', () => {
  const f = fixture();
  try { fs.unlinkSync(f.files[2]); const before = fs.readdirSync('/proc/self/fd').length; for (let i = 0; i < 12; i++) assert.throws(() => restoreProofFileOwnership(f.stage, f.uid, f.gid), {code: 'ENOENT'}); assert.equal(fs.readdirSync('/proc/self/fd').length, before); assert.equal(fs.statSync(f.files[0]).uid, 2000); }
  finally { f.cleanup(); }
});
