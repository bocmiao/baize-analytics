import{dateRange,previousDateRange}from'./time';
import{validCivilDate}from'./workspaceRoute';
export type DateSelection={ok:true;query:string}|{ok:false;reason:'invalid-range'|'unrepresentable-range'};
/** UI validation never substitutes another timezone or an inferred civil day. */
export function safeDateSelection(from:string,to:string,timeZone:string):DateSelection{
 if(!validCivilDate(from)||!validCivilDate(to)||from>to)return{ok:false,reason:'invalid-range'};
 try{return{ok:true,query:dateRange(from,to,timeZone)};}catch{return{ok:false,reason:'unrepresentable-range'};}
}

export function safePreviousDateSelection(query:string,timeZone:string):DateSelection{
 try{return{ok:true,query:previousDateRange(query,timeZone)};}catch{return{ok:false,reason:'unrepresentable-range'};}
}
