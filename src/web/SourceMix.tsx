import {dimensionText} from './dimensionLabels';
import {language} from './i18n';
import type {Row} from './api';

const colors=['#1F7A68','#5C5C5C','#8F8F8F','#A86A12','#C2412D','#3D6B8A'];

/** Stacked channel bar from rows the sources report already returns. */
export function SourceMix({rows}:{rows:Row[]}){
 const en=language()==='en';
 const parts=rows.flatMap(row=>{
  const raw=row.channel??row.source??row.name;
  if(typeof raw!=='string'||!raw)return [];
  const count=row.pv??row.uv??row.count??row.visitors;
  const n=typeof count==='number'&&Number.isFinite(count)?count:0;
  return [{label:dimensionText(typeof row.channel==='string'?'channel':'source',raw),n}];
 }).filter(part=>part.n>0);
 if(parts.length<2)return null;
 const sum=parts.reduce((total,part)=>total+part.n,0)||1;
 return <section className="source-mix" aria-label={en?'Channel mix':'渠道构成'}>
  <div className="source-mix-bar" aria-hidden="true">{parts.map((part,index)=><i key={part.label} style={{width:`${part.n/sum*100}%`,background:colors[index%colors.length]}}/>)}</div>
  <ul>{parts.map((part,index)=><li key={part.label}><i style={{background:colors[index%colors.length]}} aria-hidden="true"/>{part.label}<b>{`${(part.n/sum*100).toFixed(1)}%`}</b></li>)}</ul>
 </section>;
}
