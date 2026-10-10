import { createApp } from './app.js';
const {app}=await createApp();
await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3000)});
console.log('白泽已启动，数据库已连接。');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
