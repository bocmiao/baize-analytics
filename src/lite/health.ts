import type {LiteStorePort} from './types.js';
/** Read-only schema validation and bounded safe engine identity for readiness. */
export async function liteHealthStatus(store:LiteStorePort){
 const {schemaVersion}=await store.read<{schemaVersion:number}>('deployment_status');
 const {sqliteVersion,sourceId}=await store.runtime;
 return {ok:true,database:'ready',storage:'sqlite',cache:'disabled',geoip:'unavailable',schemaVersion,sqliteVersion,sourceId};
}
