import {preflight} from './preflight.js';
// A precompiled project-hosting entry: dependencies and assets are already in
// the verified release. Persistent directories and configuration stay outside it.
const manifest=preflight(process.cwd());
process.env.BAIZE_NATIVE_RUNTIME='1';
if(manifest.profile==='standard')await import('../server/main.js');
else await import('../lite/main.js');
