import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DockerAgent} from '../../src/update/docker-agent.js';
const profile=process.env.BAIZE_RESUME_PROFILE??'standard';if(!['standard','lite'].includes(profile))throw Error('invalid profile');
const root=resolve(process.env.BAIZE_DOCKER_ACCEPT_ROOT??'/workspace/baize-transfer/docker-accept-r2'),r=join(root,profile);
process.env.DOCKER_CONFIG='/workspace/baize-transfer/docker-cli';
const config=JSON.parse(readFileSync(join(r,'private-config.json'),'utf8')),agent=new DockerAgent(config);
const records=readdirSync(join(config.agentDir,'operations')).map(n=>JSON.parse(readFileSync(join(config.agentDir,'operations',n),'utf8'))),upgrade=records.find(v=>v.phase==='completed');if(!upgrade)throw Error('Completed actual upgrade evidence required');
await agent.open();
try{
 if(process.env.BAIZE_REPEAT_ROLLBACK==='1'){await agent.apply(config.ownerId,randomUUID(),true);await agent.apply(config.ownerId,randomUUID(),true);}
 const rolled=agent.state.phase==='rolled_back'?agent.status():await agent.apply(config.ownerId,randomUUID(),true);if(rolled.phase!=='rolled_back')throw Error('rollback incomplete');
 const login=await fetch(config.healthUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@fixture.invalid',password:'ControlledFixtureOnly!12'})});if(!login.ok)throw Error('login failed');const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
 const sites=await(await fetch(config.healthUrl+'/api/v1/sites',{headers:{cookie}})).json()as any;if(!sites.sites.some((s:any)=>s.name==='Before update')||!sites.sites.some((s:any)=>s.name==='After update'))throw Error('data lost');
 if(!(await(await fetch(config.healthUrl+'/assets/update-fixture.js')).text()).includes('"A"'))throw Error('base file missing');
 const verification=JSON.parse(readFileSync(join(config.agentDir,'images',upgrade.operationId,'verification.json'),'utf8'));
 writeFileSync(join(root,profile.toUpperCase()+'_DOCKER_RESUMED_E2E.json'),JSON.stringify({profile,realApplication:true,realDatabase:profile==='standard'?'PostgreSQL':'SQLite',productionBackupMode:config.backupMode,upgrade,rollback:rolled,verification,bothWritesSurvived:true,configPreserved:readFileSync(config.envFile,'utf8')==='POSTGRES_PASSWORD=IsolatedAcceptanceOnly\n',priorFailures:records.filter(v=>v.phase==='failed').map(v=>({operationId:v.operationId,error:v.error})),fix:'Each backup operation uses a distinct key-package directory; retry retained database and prior backups.'},null,2));console.log('PASSED '+profile+' rollback retry and both writes');
}finally{await agent.close();}
