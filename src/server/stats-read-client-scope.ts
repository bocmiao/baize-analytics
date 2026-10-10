import type {PoolClient} from 'pg';
const scopes=new WeakMap<PoolClient,string>();
/** Internal capability, installed only after the stats site snapshot gates and RR begin. */
export function registerStatsMirrorSnapshot(client:PoolClient,siteId:string){const previous=scopes.get(client);scopes.set(client,siteId);return ()=>{if(previous===undefined)scopes.delete(client);else scopes.set(client,previous);};}
export function permitsStatsMirrorSnapshot(client:PoolClient,siteId:string){return scopes.get(client)===siteId;}
