import {utmFields,type CampaignInput} from '../../packages/contracts/campaign';
type Field=typeof utmFields[number];
export type CampaignSelection=Partial<CampaignInput['parameters']>;
export function campaignAnalysisScope(query:string,selection:CampaignSelection,detail:'utm_content'|'utm_term'){
 const params=new URLSearchParams(query);
 for(const field of utmFields)if(selection[field])params.set(field,selection[field]!);
 const levels:Field[]=['utm_source','utm_campaign','utm_medium',detail];
 const field=levels.find(value=>!params.get(value))||detail;
 const dimension=field==='utm_campaign'?'campaign':field;
 params.delete('trendLabel');params.delete('trendLabels');params.set('trendDimension',dimension);
 return {query:params.toString(),field,dimension,levels};
}
export function selectCampaignLevel(selection:CampaignSelection,field:Field,value:string):CampaignSelection{
 const order=['utm_source','utm_campaign','utm_medium','utm_content','utm_term'] as const,index=order.indexOf(field);
 const next={...selection};for(const key of order.slice(index))delete next[key];next[field]=value;return next;
}
