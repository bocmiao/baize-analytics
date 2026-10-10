export interface EncodedFactPairRow {attempt_id:string;row_key:string;body_base64:string;body_hash:string}
export interface DecodedFactPairRow {row_key:string;body:string;body_hash:string}
/** Only a pair of committed, same-kind manifests may use this response.
 * Valid producer/strict-restore records have <=32768 normalized UTF8 bytes,
 * <=259 additional sealed-envelope bytes and fixed three-field provenance.
 * 202 sentinel rows base64-encode <=33027 bytes each: <=8,895,272 bytes,
 * plus bounded fixed keys/JSON framing, below the unchanged 16MiB response cap.
 * Each manifest still gets its own 101-row sentinel and <=100 output check. */
export function decodeFactPair(rows:unknown,attempts:readonly string[]):DecodedFactPairRow[][]{
 if(attempts.length!==2||attempts[0]===attempts[1]||!Array.isArray(rows)||rows.length>202)throw Error('FACT_STORE_READ_LIMIT');
 const groups:DecodedFactPairRow[][]=[[],[]];const keys=[new Set<string>(),new Set<string>()];
 for(const unknownRow of rows){
  if(!unknownRow||typeof unknownRow!=='object')throw Error('FACT_STORE_BODY_UNAVAILABLE');
  const row=unknownRow as EncodedFactPairRow;
  const index=attempts.indexOf(row.attempt_id);
  if(index<0||typeof row.row_key!=='string'||typeof row.body_hash!=='string'||typeof row.body_base64!=='string')throw Error('FACT_STORE_BODY_UNAVAILABLE');
  if(row.body_base64.length>44036)throw Error('FACT_STORE_BODY_UNAVAILABLE');
  if(keys[index]!.has(row.row_key))throw Error('FACT_STORE_BODY_UNAVAILABLE');
  keys[index]!.add(row.row_key);
  if(groups[index]!.length>=100)throw Error('FACT_STORE_READ_LIMIT');
  // Buffer.from alone accepts malformed/truncated base64: re-encoding must
  // match exactly before fatal UTF8 decoding exposes the original JSON bytes.
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.body_base64))throw Error('FACT_STORE_BODY_UNAVAILABLE');
  const decoded=Buffer.from(row.body_base64,'base64');
  if(decoded.toString('base64')!==row.body_base64)throw Error('FACT_STORE_BODY_UNAVAILABLE');
  let body:string;try{body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(decoded);}catch{throw Error('FACT_STORE_BODY_UNAVAILABLE');}
  groups[index]!.push({row_key:row.row_key,body,body_hash:row.body_hash});
 }
 // Preserve each original query's ORDER BY row_key and manifest yield order.
 for(const group of groups)group.sort((a,b)=>a.row_key<b.row_key?-1:a.row_key>b.row_key?1:0);
 return groups;
}
