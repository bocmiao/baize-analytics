import type {ReactNode} from 'react';

/** Inline bar ranking. The name stays put while the metric strip scrolls on a narrow card. */
export function RankList({label, rows, metrics}:{
 label:string;
 metrics:string[];
 rows:{key:string; name:ReactNode; bar:number; values:ReactNode[]; extra?:ReactNode}[];
}){
 return <div className="rank-scroll" tabIndex={0} role="region" aria-label={label}>
  <div className="rank-head"><span>{metrics[0]}</span><div className="metrics">{metrics.slice(1).map((metric,index)=><span key={`${metric}-${index}`}>{metric}</span>)}</div></div>
  <ul className="rank-rows">{rows.map(row=><li key={row.key}>
   <span className="bar-bg" style={{width:`${Math.max(0,Math.min(92,row.bar))}%`}} aria-hidden="true"/>
   <span className="k">{row.name}</span>
   <span className="metrics">{row.values.map((value,index)=><b key={index}>{value}</b>)}{row.extra}</span>
  </li>)}</ul>
 </div>;
}
