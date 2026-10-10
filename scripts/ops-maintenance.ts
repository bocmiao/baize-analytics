import {createApp} from '../src/server/app.js';
import {runGovernance} from '../src/server/governance-worker.js';
const {app,ctx}=await createApp({background:false});
try{await runGovernance(ctx);}finally{await app.close();}
