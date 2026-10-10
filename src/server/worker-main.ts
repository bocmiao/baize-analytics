import { Pool } from 'pg';
import { runWorkerOnce,enforceRetention } from './worker.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL});let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});let lastRetention=0;
while(!stopping){try{if(Date.now()-lastRetention>3600000){await enforceRetention(pool);lastRetention=Date.now();}if(!await runWorkerOnce(pool))await new Promise(resolve=>setTimeout(resolve,1000));}catch{console.error('worker cycle failed; retrying');await new Promise(resolve=>setTimeout(resolve,2000));}}
await pool.end();
