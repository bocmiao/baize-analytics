export const visitColumns=[['time','访问时间'],['visitorKey','访客标识'],['visitorType','访客类型'],['country','国家 / 地区'],['region','省 / 区域'],['city','城市'],['ipLabel','IP 标识'],['isp','运营商'],['browser','浏览器'],['referrer','来路网站'],['entry','入口页'],['keyword','关键词'],['pageviews','浏览页数'],['duration','访问时长']] as const;
export type VisitColumn=typeof visitColumns[number][0];
export interface VisitQueryState {page:number;size:number;sort:VisitColumn;direction:'asc'|'desc';filters?:Record<string,string>;ipKey?:string;visitorKey?:string;dimension?:string;label?:string}
export function visitReportQuery(scope:string,state:VisitQueryState){
 const params=new URLSearchParams(scope);
 for(const key of ['page','pageSize','sort','direction','visitDimension','visitLabel','ipKey'])params.delete(key);
 for(const [key,value] of Object.entries(state.filters||{}))if(value.trim())params.set(key,value.trim());
 if(state.ipKey)params.set('ipKey',state.ipKey);
 if(state.visitorKey)params.set('visitorKey',state.visitorKey);
 if(state.dimension&&state.label!==undefined){params.set('visitDimension',state.dimension);params.set('visitLabel',state.label);}
 params.set('page',String(state.page));params.set('pageSize',String(state.size));params.set('sort',state.sort);params.set('direction',state.direction);
 return params.toString();
}
export function visitorHistoryQuery(scope:string){const params=new URLSearchParams(scope);return new URLSearchParams({from:params.get('from')!,to:params.get('to')!}).toString();}
