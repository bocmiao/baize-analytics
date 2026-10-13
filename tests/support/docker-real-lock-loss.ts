import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {DockerAgent} from '../../src/update/docker-agent.js';
const config=JSON.parse(readFileSync('/workspace/baize-transfer/docker-accept-r2/lite/private-config.json','utf8'));
process.env.DOCKER_CONFIG='/workspace/baize-transfer/docker-cli';
const docker=(...a:string[])=>execFileSync('/usr/local/bin/docker',a,{encoding:'utf8'}).trim();
const agent=new DockerAgent(config),runtime=agent.runtime as any;await agent.open();
const foreign=docker('run','-d','--pull=never','--label','com.docker.compose.project='+config.project,'--label','com.docker.compose.service=app','--env','BAIZE_UPDATE_LAUNCH_ID='+randomUUID(),config.initial.imageId,'node','-e','setInterval(()=>{},1000)');
const command=runtime.command.bind(runtime);let launched!:()=>void;const entered=new Promise<void>(r=>launched=r);
runtime.command=async(args:string[],...rest:any[])=>{if(args.includes('run')&&args.includes('dist/server/scripts/lite-ops.js')){const index=args.indexOf('dist/server/scripts/lite-ops.js');const job=command([...args.slice(0,index),'-e','setInterval(()=>{},1000)'],...rest);void job.catch(()=>{});for(let i=0;i<100;i++){const ids=docker('ps','--filter','label=com.docker.compose.project='+config.project,'--filter','label=com.docker.compose.oneoff=True','--format','{{.ID}}');if(ids){launched();break;}await new Promise(r=>setTimeout(r,100));}return job;}return command(args,...rest);};
try{
 const outcome=agent.apply(config.ownerId,randomUUID(),true).then(()=>({error:null}),e=>({error:e.message}));await entered;
 const rows=execFileSync('ps',['--ppid',String(process.pid),'-o','pid=,args='],{encoding:'utf8'}).split('\n');const row=rows.find(v=>v.includes('flock -n '+join(config.agentDir,'native-runtime.lock')+' '));if(!row)throw Error('flock fixture missing');process.kill(Number(row.trim().split(/\s+/)[0]),'SIGKILL');
 const result=await outcome;if(result.error!=='UPDATE_EXECUTOR_LOCK_LOST'||!existsSync(agent.gateFile))throw Error('lost lock did not remain fenced');
 const launches=JSON.parse(readFileSync(join(config.agentDir,'runtime-launches.json'),'utf8')).launches;
 const ids=docker('ps','--filter','label=com.docker.compose.project='+config.project,'--filter','label=com.docker.compose.service=app','--format','{{.ID}}').split(/\s+/).filter(Boolean);for(const id of ids){const c=JSON.parse(docker('inspect',id))[0];const launch=c.Config.Env.find((v:string)=>v.startsWith('BAIZE_UPDATE_LAUNCH_ID='))?.split('=')[1];if(launches.includes(launch))throw Error('owned container remains running');}
 if(JSON.parse(docker('inspect',foreign))[0].State.Running!==true)throw Error('foreign container was stopped');
 writeFileSync('/workspace/baize-transfer/REAL_DOCKER_LOCK_LOSS.json',JSON.stringify({realDocker:true,realFlockKilled:true,pausedOneOffDoesNotWriteDatabase:true,ownedMainAndOneOffStopped:true,foreignSameProjectContainerStillRunning:true,maintenanceRetained:true,result},null,2));
}finally{await agent.close();docker('stop','--time','5',foreign);docker('rm',foreign);}
