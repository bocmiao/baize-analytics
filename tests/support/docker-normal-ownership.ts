import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {DockerAgent} from '../../src/update/docker-agent.js';
const path=process.env.BAIZE_OWNERSHIP_CONFIG;if(!path||path!==resolve(path))throw Error('Explicit controlled fixture config required');
const config=JSON.parse(readFileSync(path,'utf8'));if(!config.source.allowLocalFixture)throw Error('Controlled fixture only');
process.env.DOCKER_CONFIG='/workspace/baize-transfer/docker-cli';
const docker=(...a:string[])=>execFileSync('/usr/local/bin/docker',a,{encoding:'utf8'}).trim();
const inspect=(id:string)=>JSON.parse(docker('inspect',id))[0];
const agent=new DockerAgent(config);await agent.open();const image=agent.state.current;
const foreignLaunch=randomUUID(),foreign=docker('run','-d','--pull=never','--label','com.docker.compose.project='+config.project,'--label','com.docker.compose.service=app','--label','com.docker.compose.oneoff=False','--env','BAIZE_UPDATE_LAUNCH_ID='+foreignLaunch,image.imageId);
const runtime=agent.runtime as any,command=runtime.command.bind(runtime),calls:string[][]=[],commandFailures:{args:string[];error:string}[]=[];
runtime.command=async(args:string[],...rest:any[])=>{calls.push(args);try{return await command(args,...rest);}catch(e){commandFailures.push({args,error:(e as Error).message});throw e;}};
try{
 const operationId=randomUUID(),result=await agent.apply(config.ownerId,operationId,true).then(()=>({error:null}),e=>({error:e.message}));
 if(result.error!=='UPDATE_ROLLBACK_HEALTH_FAILED'||!existsSync(agent.gateFile))throw Error('Expected fenced refusal with foreign main present');
 const changedLaunch=runtime.launchId;const directStart=await runtime.start(image).then(()=>({error:null}),e=>({error:e.message}));if(directStart.error!=='UPDATE_CONTAINER_NOT_OWNED')throw Error('Direct start did not refuse foreign main');
 await runtime.stop(image); // Backup created a newer launch ID; the earlier owned main must still be accepted.
 if(!inspect(foreign).State.Running||inspect(foreign).Image!==image.imageId)throw Error('Foreign same-image container changed');
 if(calls.some(a=>a.includes('up')))throw Error('Compose up attempted with foreign main present');
 const ids=docker('container','ls','--all','--filter','label=com.docker.compose.project='+config.project,'--filter','label=com.docker.compose.service=app','--filter','label=com.docker.compose.oneoff=False','--format','{{.ID}}').split(/\s+/).filter(Boolean);
 const claimed=ids.map(inspect).filter(c=>c.Id!==foreign);if(claimed.some(c=>c.State.Running))throw Error('Owned main remains running');
 await agent.close();if(!inspect(foreign).State.Running)throw Error('Close stopped foreign main');
 const output=process.env.BAIZE_OWNERSHIP_EVIDENCE;if(!output)throw Error('Explicit evidence file required');
 writeFileSync(output,JSON.stringify({realDocker:true,sameImmutableImageId:image.imageId,foreignContainerId:foreign,foreignLaunchId:foreignLaunch,backupChangedLaunchId:changedLaunch,actualBackupCompleted:agent.state.backupCreated,normalStopPreservedForeign:true,startAndErrorRecoveryRefusedComposeUp:true,closePreservedForeign:true,maintenanceRetained:true,result,state:agent.status(),commands:calls,commandFailures,directStart},null,2));
}finally{await agent.close();docker('stop','--time','5',foreign);docker('rm',foreign);}
const recovery=new DockerAgent(config);try{await recovery.open();const h=await(await fetch(config.healthUrl+'/healthz')).json()as any;if(!h.ok||h.database!=='ready')throw Error('Owned service did not recover after controlled foreign cleanup');}finally{await recovery.close();}
