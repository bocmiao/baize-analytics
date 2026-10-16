import {t} from './i18n';

type Point={label:string;value:number|null};
export function formatEvidenceTooltip(items:unknown,{points,metricLabel,comparison,openEnded=false}:{points:Point[];metricLabel:string;comparison?:{name:string;points:Point[]};openEnded?:boolean}){
 if(!Array.isArray(items)||!items.length||!items[0]||typeof items[0]!=='object')return '';
 const index=(items[0] as {dataIndex?:unknown}).dataIndex;
 if(typeof index!=='number'||!Number.isInteger(index)||!points[index])return '';
 const current=points[index],previous=comparison?.points[index];
 const unfinished=openEnded&&index===points.length-1?` · ${t('未完结')}`:'';
 const delta=!openEnded&&typeof current.value==='number'&&Number.isFinite(current.value)&&typeof previous?.value==='number'&&Number.isFinite(previous.value)&&previous.value>0
  ?` · ${current.value>=previous.value?'+':''}${((current.value/previous.value-1)*100).toFixed(1)}%`:'';
 return `${current.label}${unfinished}\n${metricLabel}: ${current.value??'—'}${previous?`\n${comparison!.name} · ${previous.label}: ${previous.value??'—'}${delta}`:''}`;
}
