import {language} from './i18n';

const channels:Record<string,[string,string]>={
 direct:['直接访问','Direct'],search:['自然搜索','Search'],organic:['自然搜索','Organic search'],organic_search:['自然搜索','Organic search'],
 social:['社交媒体','Social'],ai:['AI 引荐','AI referral'],paid:['付费广告','Paid'],paid_search:['付费搜索','Paid search'],
 email:['邮件','Email'],referral:['外部网站','Referral'],unknown:['未知来源','Unknown source'],
};
const devices:Record<string,[string,string]>={
 desktop:['电脑','Desktop'],mobile:['手机','Mobile'],tablet:['平板','Tablet'],unknown:['未知','Unknown'],
};

/** Shared display names for dimension values already returned by the API. */
export function dimensionText(key:string,value:unknown):string{
 const en=language()==='en';
 if(value===null||value===undefined||value==='')return en?'Unknown':'未知';
 const raw=String(value);
 if(key==='path'&&(raw==='/'||raw==='home'))return en?'Home':'首页';
 const table=key==='channel'||key==='source'?channels:key==='device'?devices:undefined;
 if(table&&Object.hasOwn(table,raw))return en?table[raw]![1]:table[raw]![0];
 if((key==='country'||key==='region'||key==='city')&&['unknown','Unknown','ZZ'].includes(raw))return en?'Unknown':'未知';
 if(key==='country'&&/^[A-Z]{2}$/.test(raw)){
  try{return new Intl.DisplayNames([en?'en':'zh-CN'],{type:'region'}).of(raw)||raw;}catch{return raw;}
 }
 return raw;
}
