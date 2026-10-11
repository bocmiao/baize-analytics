/** At most two independent upload/readback tasks; never return while a started
 * task still runs. Preserve the first observed original failure, including a
 * synchronous failure. No retry, timeout extension or detached promise. */
export async function settleFactPublicationUploads(tasks:readonly (()=>Promise<void>)[]):Promise<void>{
 if(tasks.length>2)throw Error('FACT_STORE_PUBLICATION_PIPELINE_LIMIT');
 let failed=false,firstError:unknown;
 await Promise.allSettled(tasks.map(task=>Promise.resolve().then(task).catch(error=>{if(!failed){failed=true;firstError=error;}throw error;})));
 if(failed)throw firstError;
}
