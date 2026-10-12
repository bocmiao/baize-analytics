// Build-time only: preserve the TS maintenance interface while removing build/test tools.
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {execFileSync} from 'node:child_process';

const source = resolve(process.argv[2] ?? '.');
const target = resolve(process.argv[3] ?? '/runtime');
if (target === source || !relative(source, target).startsWith('..')) {
  throw new Error('Runtime staging must be outside the source directory');
}
if (existsSync(target)) throw new Error('Runtime staging destination must not exist');
mkdirSync(target, {recursive: true});
// Keep operational sources and migrations; documentation, tests and benchmark data
// remain in the complete source distribution, not the application image.
const entries = ['dist', 'public', 'src', 'scripts', 'sdk', 'packages', 'plugins',
  'db', 'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.server.json', 'vite.config.ts', 'node_modules'];
for (const entry of entries) cpSync(resolve(source, entry), resolve(target, entry), {recursive: true});
const manifestPath = resolve(target, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const tsx = manifest.dependencies?.tsx ?? manifest.devDependencies?.tsx;
if (!tsx) throw new Error('Maintenance TS runtime is missing from the dependency manifest');
manifest.dependencies = {...manifest.dependencies, tsx};
delete manifest.devDependencies.tsx;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
// Use only already-installed, lockfile-pinned packages. Never run dependency scripts
// or access the registry while producing the runtime artifact.
execFileSync('npm', ['prune', '--omit=dev', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: target, stdio: 'inherit', env: {...process.env, npm_config_update_notifier: 'false'},
});
// Preserve source identities used by the backup/restore/upgrade acceptance guard.
// The separate witness describes the intentionally smaller installed runtime graph.
const witness = resolve(target, 'runtime-dependencies');
mkdirSync(witness);
for (const entry of ['package.json', 'package-lock.json']) {
  cpSync(resolve(target, entry), resolve(witness, entry));
  cpSync(resolve(source, entry), resolve(target, entry));
}
symlinkSync('../node_modules', resolve(witness, 'node_modules'), 'dir');
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  "await import('pg'); await import('ioredis'); await import('./src/server/db.ts'); await import('./scripts/restore-rebuild.ts');"],
{cwd: target, stdio: 'inherit'});
