import {resolve,join} from 'node:path';
import {createLiteStore} from '../src/lite/store.js';
import {backupLite,restoreLite} from '../src/lite/backup.js';
const [command,destination,targetKeys]=process.argv.slice(2),dataDir=resolve(process.env.LITE_DATA_DIR??process.env.DATA_DIR??'data-lite'),keyDir=resolve(process.env.LITE_KEYS_DIR??process.env.KEYS_DIR??join(dataDir,'keys'));
if(!destination||!['backup','restore','retention'].includes(command??''))throw Error('Usage: lite-ops backup DEST | restore BACKUP TARGET_DATA TARGET_KEYS | retention CONFIRM');
if(command==='retention'&&destination!=='CONFIRM')throw Error('Retention requires the literal CONFIRM');
// Acquiring the same writer flock rejects operations while the server is running.
const store=createLiteStore({dataDir,keyDir});
try{await store.runtime;if(command==='backup')console.log(JSON.stringify(await backupLite(store,{dataDir,keyDir},resolve(destination))));else if(command==='retention')console.log(JSON.stringify(await store.call('retention')));else{const targetData=targetKeys,targetKey=process.argv[5];if(!targetData||!targetKey)throw Error('Restore requires new target data/key directories');console.log(JSON.stringify(await restoreLite({sourceStore:store,backupDir:resolve(destination),targetDataDir:resolve(targetData),targetKeyDir:resolve(targetKey),currentDataDir:dataDir,currentKeyDir:keyDir})));}}finally{await store.close();}
