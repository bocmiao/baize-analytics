import {language,t} from './i18n';

type Point={label:string;value:number|null};
function pointWeekday(label:string,timezone?:string){
 if(!timezone)return '';
 const date=new Date(label);
 if(!Number.isFinite(+date))return '';
 try{return new Intl.DateTimeFormat(language()==='en'?'en':'zh-CN',{timeZone:timezone,weekday:'short'}).format(date);}catch{return '';}
}
export function formatEvidenceTooltip(items:unknown,{points,metricLabel,comparison,openEnded=false,timezone}:{points:Point[];metricLabel:string;comparison?:{name:string;points:Point[]};openEnded?:boolean;timezone?:string}){
 if(!Array.isArray(items)||!items.length||!items[0]||typeof items[0]!=='object')return '';
 const index=(items[0] as {dataIndex?:unknown}).dataIndex;
 if(typeof index!=='number'||!Number.isInteger(index)||!points[index])return '';
 const current=points[index],previous=comparison?.points[index];
 const weekday=pointWeekday(current.label,timezone);
 const unfinished=openEnded&&index===points.length-1?` · ${t('未完结')}`:'';
 const delta=!openEnded&&typeof current.value==='number'&&Number.isFinite(current.value)&&typeof previous?.value==='number'&&Number.isFinite(previous.value)&&previous.value>0
  ?` · ${current.value>=previous.value?'+':''}${((current.value/previous.value-1)*100).toFixed(1)}%`:'';
 return `${current.label}${weekday?` · ${weekday}`:''}${unfinished}\n${metricLabel}: ${current.value??'—'}${previous?`\n${comparison!.name} · ${previous.label}: ${previous.value??'—'}${delta}`:''}`;
}
