import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
export default defineConfig({plugins:[react(),{
 name:'baize-font-license',
 generateBundle(){this.emitFile({type:'asset',fileName:'assets/noto-sans-sc.LICENSE.txt',source:readFileSync(new URL('./node_modules/@fontsource/noto-sans-sc/LICENSE',import.meta.url),'utf8')});},
}],build:{outDir:'dist/web'},server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3000','/tracker.js':'http://127.0.0.1:3000'}}});
