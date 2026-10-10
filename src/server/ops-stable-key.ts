import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
/** Original v1 key authenticates recovery state even after active-key rotation. */
export async function readOpsStableKey(env:NodeJS.ProcessEnv=process.env){let material:Buffer|undefined;if(env.KEYS_DIR)try{material=await readFile(join(resolve(env.KEYS_DIR),'master.v1.key'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(!material){if(!env.MASTER_KEY_FILE)throw Error('REPLAY_RETENTION_STABLE_KEY_REQUIRED');material=await readFile(env.MASTER_KEY_FILE);}const key=material.length===32?material:Buffer.from(material.toString().trim(),'hex');if(key.length!==32)throw Error('REPLAY_RETENTION_STABLE_KEY_INVALID');return key;}
