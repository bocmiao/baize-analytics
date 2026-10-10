import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ExternalError} from './external-errors.js';
export const MANUAL_CSV_BYTES=5*1024*1024,MANUAL_CSV_ROWS=100000;
export const manualSearchInput=z.object({csv:z.string().max(MANUAL_CSV_BYTES),label:z.string().trim().min(1).max(120),mapping:z.object({day:z.string().min(1).max(200),query:z.string().min(1).max(200),page:z.string().min(1).max(200),clicks:z.string().min(1).max(200),impressions:z.string().min(1).max(200),position:z.string().min(1).max(200)}).strict(),customTemplateAcknowledged:z.literal(true)}).strict();
export type ManualSearchInput=z.infer<typeof manualSearchInput>;
export type ManualSearchRow={day:string;query:string;page:string;clicks:number;impressions:number;position:number};
const invalid=()=>{throw new ExternalError('external_config_invalid')};
/** Bounded RFC-style comma CSV; quoted commas/newlines/doubled quotes are supported. */
export function csvRecords(text:string):string[][]{
 if(Buffer.byteLength(text,'utf8')>MANUAL_CSV_BYTES)invalid();text=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>100)invalid()};
 const pushRow=()=>{pushCell();if(row.some(c=>c!==''))rows.push(row);row=[];if(rows.length>MANUAL_CSV_ROWS+1)invalid()};
 for(let i=0;i<text.length;i++){const char=text[i]!;
  if(quoted){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;}
  else if(char===',')pushCell();else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;pushRow();}
  else if(char==='"'){if(cell!==''||closed)invalid();quoted=true;}else{if(closed)invalid();cell+=char;}
  if(cell.length>8192)invalid();
 }
 if(quoted)invalid();if(cell!==''||row.length||closed)pushRow();if(rows.length<2)invalid();return rows;
}
export function parseManualSearch(input:ManualSearchInput,domain:string):{rows:ManualSearchRow[];headers:string[];digest:string;start:string;end:string}{
 const table=csvRecords(input.csv),headers=table.shift()!.map(s=>s.trim());if(headers.some(s=>!s)||new Set(headers).size!==headers.length)invalid();
 const names=Object.values(input.mapping);if(new Set(names).size!==names.length||names.some(n=>!headers.includes(n)))invalid();
 const host=domain.toLowerCase().replace(/\.$/,'');const rows:ManualSearchRow[]=table.map(cells=>{
  if(cells.length!==headers.length)invalid();const get=(name:keyof ManualSearchInput['mapping'])=>cells[headers.indexOf(input.mapping[name])]!.trim();const day=get('day');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day.startsWith('0000')||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)invalid();
  const query=get('query');if(!query||query.length>1024||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(query))invalid();let url:URL;try{url=new URL(get('page'))}catch{return invalid()};if(!['https:','http:'].includes(url.protocol)||url.hostname.toLowerCase().replace(/\.$/,'')!==host||url.username||url.password||url.port)invalid();url.search='';url.hash='';
  const number=(key:'clicks'|'impressions'|'position',integer:boolean)=>{const raw=get(key);if(!/^\d+(?:\.\d+)?$/.test(raw))invalid();const value=Number(raw);if(!Number.isFinite(value)||value<0||integer&&!Number.isSafeInteger(value)||value>Number.MAX_SAFE_INTEGER)invalid();return value};const clicks=number('clicks',true),impressions=number('impressions',true),position=number('position',false);if(clicks>impressions||position>1000000)invalid();return {day,query,page:url.toString(),clicks,impressions,position};
 });const days=rows.map(r=>r.day).sort();return {rows,headers,digest:createHash('sha256').update(JSON.stringify({label:input.label,mapping:input.mapping,rows})).digest('hex'),start:days[0]!,end:days.at(-1)!};
}
// Only template output is downloadable CSV. Defend spreadsheet formula execution.
export function safeCsvCell(value:unknown):string{let text=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
export const MANUAL_SEARCH_TEMPLATE='day,query,page,clicks,impressions,position\r\n';
