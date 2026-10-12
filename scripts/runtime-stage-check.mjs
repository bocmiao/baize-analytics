// Verify the staged dependency closure without database connections or credentials.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHmac} from 'node:crypto';

const directory = resolve(process.argv[2] ?? '.');
const run = (args, extraEnv = {}) => spawnSync(process.execPath, args, {
  cwd: directory, encoding: 'utf8', env: {...process.env, ...extraEnv},
});
for (const path of ['docs', 'tests', 'benchmark', '.git', '.env', '.baize', 'backups']) {
  assert.equal(existsSync(resolve(directory, path)), false, `Unexpected runtime entry: ${path}`);
}
for (const dependency of ['typescript', 'vite', 'vitest', 'eslint', '@playwright/test', '@gfx/zopfli']) {
  assert.equal(existsSync(resolve(directory, 'node_modules', dependency)), false, `Build dependency retained: ${dependency}`);
}
assert.ok(existsSync(resolve(directory, 'dist/server/src/server/main.js')));
assert.ok(existsSync(resolve(directory, 'dist/web/index.html')));
assert.ok(existsSync(resolve(directory, 'db/migrations')));
const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
assert.ok(manifest.dependencies.tsx, 'TS maintenance runtime must be a production dependency');
const dependencies = spawnSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
  cwd: directory, encoding: 'utf8', env: {...process.env, npm_config_update_notifier: 'false'},
});
assert.equal(dependencies.status, 0, dependencies.stderr || dependencies.stdout);
const imports = run(['--import', 'tsx', '--input-type=module', '-e',
  "await import('./src/server/app.ts'); await import('./src/server/db.ts'); await import('./scripts/restore-rebuild.ts');"]);
assert.equal(imports.status, 0, imports.stderr);
for (const [script, expected, env] of [
  ['canonical-ops-runtime.ts', 'Usage canonical-ops-runtime backup|restore DIRECTORY', {}],
  ['replay-retention-proof-runtime.ts', 'Usage replay-retention-proof-runtime capture|validate PACKAGE_DIRECTORY', {}],
  ['restore-runtime.ts', 'Unsafe restore database', {RESTORE_DATABASE: 'unsafe'}],
]) {
  const result = run(['--import', 'tsx', `scripts/${script}`], env);
  assert.equal(result.status, 1, `${script} must reject the invalid invocation`);
  assert.ok(result.stderr.includes(expected), `${script}: ${result.stderr}`);
  assert.ok(!result.stderr.includes('ERR_MODULE_NOT_FOUND'), result.stderr);
}
const fixture = mkdtempSync(resolve(tmpdir(), 'baize-runtime-proof-'));
try {
  mkdirSync(resolve(fixture, 'history'));
  const key = Buffer.alloc(32, 19); // Synthetic test material only.
  const keyPath = resolve(fixture, 'fixture-key');
  writeFileSync(keyPath, key, {mode: 0o600});
  writeFileSync(resolve(fixture, 'index.json'), JSON.stringify({version: 1, sites: ['fixture-site']}));
  writeFileSync(resolve(fixture, 'history/manifest.json'), JSON.stringify({sourceScope: 'fixture-scope', manifests: []}));
  const body = {version: 2, scope: 'canonical-and-history-replay', sourceScope: 'fixture-scope',
    issuedAt: new Date().toISOString(), sites: [{siteId: 'fixture-site', cutoff: new Date(Date.now() - 1000).toISOString()}]};
  const proof = {...body, mac: createHmac('sha256', key).update('baize-replay-retention-proof-v2\n').update(JSON.stringify(body)).digest('hex')};
  const proofPath = resolve(fixture, 'replay-retention-proof.json');
  writeFileSync(proofPath, JSON.stringify(proof));
  const env = {KEYS_DIR: resolve(fixture, 'absent-keys'), MASTER_KEY_FILE: keyPath};
  const args = ['--import', 'tsx', 'scripts/replay-retention-proof-runtime.ts', 'validate', fixture];
  const valid = run(args, env);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), {verified: true, sites: 1});
  proof.sites[0].cutoff = new Date(Date.now() - 2000).toISOString();
  writeFileSync(proofPath, JSON.stringify(proof));
  const tampered = run(args, env);
  assert.equal(tampered.status, 1);
  assert.ok(tampered.stderr.includes('REPLAY_RETENTION_PROOF_SIGNATURE_INVALID'), tampered.stderr);
} finally {
  rmSync(fixture, {recursive: true, force: true});
}
console.log('runtime closure: production graph, app imports, three maintenance guards and signed proof validation/tamper rejection passed');
