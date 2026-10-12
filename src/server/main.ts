import { createApp } from './app.js';
import {acquireNativeRuntimeLock} from '../release/runtime-lock.js';
let shutdown:()=>Promise<void>=async()=>{process.exitCode=1;};
const release=process.env.BAIZE_NATIVE_RUNTIME==='1'?await acquireNativeRuntimeLock(process.env.DATA_DIR??'data',()=>{void shutdown().finally(()=>process.exit(1));}):async()=>{};
let app:Awaited<ReturnType<typeof createApp>>['app'];
try{({app}=await createApp({background:process.env.BAIZE_NATIVE_VALIDATE_ONLY==='1'?false:undefined}));await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3000)});}catch(error){await release();throw error;}
let closing:Promise<void>|undefined;
shutdown=()=>closing??=(async()=>{try{await app.close();}finally{await release();}})();
console.log('白泽已启动，数据库已连接。');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void shutdown().then(()=>process.exit(0));});
