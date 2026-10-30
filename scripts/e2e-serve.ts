/** 起一个全新 lite 实例供 e2e global-setup 走向导。用法：npx tsx scripts/e2e-serve.ts */
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createLiteApp} from '../src/lite/app.js';
import {prepareInstallationFixture} from '../tests/helpers/install-fixture.js';

const root = join(process.cwd(), '.baize-preview', 'e2e-serve');
await mkdir(root, {recursive: true});
const keyDir = join(root, 'keys');
await prepareInstallationFixture(keyDir);
const runtime = await createLiteApp({dataDir: join(root, 'data'), keyDir, publicUrl: 'http://127.0.0.1:3000'});
await runtime.app.listen({host: '127.0.0.1', port: 3000});
console.log('e2e lite instance on http://127.0.0.1:3000');
