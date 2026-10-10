/** At most two independent network reads; never leave an unobserved request
 * running after failure. Preserve input order and the original failure value. */
export async function settledReadPair<T,U>(items:readonly T[],read:(item:T)=>Promise<U>):Promise<U[]>{
 if(items.length>2)throw Error('READ_PREFETCH_SCOPE');
 const settled=await Promise.allSettled(items.map(item=>Promise.resolve().then(()=>read(item))));
 const failed=settled.find((result):result is PromiseRejectedResult=>result.status==='rejected');if(failed)throw failed.reason;
 return settled.map(result=>(result as PromiseFulfilledResult<U>).value);
}
