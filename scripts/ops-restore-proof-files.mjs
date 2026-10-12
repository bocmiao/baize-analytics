import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

/** Linux container-only: anchor every child lookup to an open directory FD. */
export function restoreProofFileOwnership(stage, uid, gid) {
  assert.match(stage, /^\/tmp\/baize-retention-check-[0-9]+-[0-9]+$/);
  assert(Number.isSafeInteger(uid) && uid >= 0 && Number.isSafeInteger(gid) && gid >= 0);
  const descriptors = [];
  const openDirectory = path => {
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    descriptors.push(fd);
    return fd;
  };
  const directoryOwner = fd => {
    const stat = fs.fstatSync(fd);
    assert.equal(stat.uid, uid, 'Proof directory must belong to the actual application UID');
    assert.equal(stat.gid, gid, 'Proof directory must belong to the actual application GID');
    assert.equal(stat.mode & 0o777, 0o700, 'Proof directory must remain private');
  };
  try {
    const temporary = openDirectory('/tmp');
    const base = openDirectory(`/proc/self/fd/${temporary}/${stage.slice('/tmp/'.length)}`);
    directoryOwner(base);
    const history = openDirectory(`/proc/self/fd/${base}/history`);
    directoryOwner(history);
    const files = [[base, 'index.json'], [history, 'manifest.json'], [base, 'replay-retention-proof.json']].map(([parent, name]) => {
      const fd = fs.openSync(`/proc/self/fd/${parent}/${name}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      descriptors.push(fd);
      const stat = fs.fstatSync(fd);
      assert(stat.isFile(), 'Proof input must be a regular file');
      assert.equal(stat.nlink, 1, 'Proof input must not be hard-linked');
      return fd;
    });
    // Validate every descriptor before changing any ownership or file mode.
    for (const fd of files) {
      fs.fchownSync(fd, uid, gid);
      fs.fchmodSync(fd, 0o600);
      const stat = fs.fstatSync(fd);
      assert.equal(stat.uid, uid);
      assert.equal(stat.gid, gid);
      assert.equal(stat.mode & 0o777, 0o600);
    }
  } finally {
    for (const fd of descriptors.reverse()) fs.closeSync(fd);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assert.equal(process.argv.length, 5);
  assert.match(process.argv[3], /^[0-9]+$/);
  assert.match(process.argv[4], /^[0-9]+$/);
  restoreProofFileOwnership(process.argv[2], Number(process.argv[3]), Number(process.argv[4]));
  console.log('Restore proof ownership verified for actual application identity, mode0600.');
}
