import {t} from './i18n';
import type {Row} from './api';

/** Horizontal bars from the analysis payload. Missing steps stay absent. */
export function FunnelBars({funnels}:{funnels:Row[]}){
 const charts=funnels.filter(funnel=>Array.isArray(funnel.steps)&&funnel.steps.length>0&&funnel.steps.every(step=>typeof step==='number'&&Number.isFinite(step)));
 if(!charts.length)return null;
 return <div className="funnel-hbar">{charts.map(funnel=>{
  const steps=funnel.steps as number[];
  const first=typeof steps[0]==='number'&&steps[0]>0?steps[0]:0;
  return <section key={String(funnel.id||funnel.name)}><h3>{String(funnel.name||t('漏斗'))}</h3><ol>{steps.map((count,index)=>{const width=first?Math.max(0,Math.min(100,count/first*100)):0;return <li key={index}><span>{t('步骤')} {index+1}</span><i aria-hidden="true"><b style={{width:`${width}%`}}/></i><strong>{count.toLocaleString()}</strong></li>;})}</ol></section>;
 })}</div>;
}
