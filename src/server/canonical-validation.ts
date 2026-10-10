/** A serializer for one immutable, normalized record validation only.
 * The caller must discard it after the record and never mutate cached objects.
 * It preserves security.canonical bytes; it does not trust wire JSON bytes. */
export function canonicalForValidation(): (value:unknown)=>string {
 const bytes=new WeakMap<object,string>();
 let normalizedInput=true;
 const serialize=(value:unknown):string=>{
  if(value&&typeof value==='object'){
   const prior=bytes.get(value);if(prior!==undefined)return prior;
   const result=Array.isArray(value)?`[${value.map(serialize).join(',')}]`:`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${serialize(item)}`).join(',')}}`;
   // Only the first call (the fully normalized record and its subtree)
   // enters the cache. Later wire provenance/envelope objects never enter it.
   if(normalizedInput)bytes.set(value,result);return result;
  }
  return JSON.stringify(value);
 };
 return value=>{try{return serialize(value);}finally{normalizedInput=false;}};
}
