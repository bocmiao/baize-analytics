import type {PoolClient} from 'pg';

/** Only for internal, already-declared static/random cursor identifiers.
 * A secondary CLOSE failure is suppressed only when the caller is already
 * propagating a primary failure. The outer transaction must still ROLLBACK.
 * Without a primary failure cleanup errors remain fatal; no context is logged.
 */
export async function closePgCursor(client:Pick<PoolClient,'query'>,cursor:string,primaryFailed:boolean):Promise<void>{
 if(typeof cursor!=='string'||! /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(cursor)||typeof primaryFailed!=='boolean')throw Error('PG_CURSOR_CLEANUP_IDENTIFIER_INVALID');
 try{await client.query(`CLOSE ${cursor}`);}catch(error){if(!primaryFailed)throw error;}
}
