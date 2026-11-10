import {z} from 'zod';

export const utmFields=['utm_source','utm_campaign','utm_medium','utm_content','utm_term'] as const;
export const utmLabels:Record<typeof utmFields[number],string>={utm_source:'渠道来源',utm_campaign:'活动名称',utm_medium:'渠道媒介',utm_content:'推广内容',utm_term:'关键词'};
const value=z.string().trim().max(128).refine(text=>!/[\u0000-\u001f\u007f]/.test(text),'参数不能包含控制字符');
export const campaignParametersSchema=z.object({utm_source:value.min(1),utm_campaign:value.default(''),utm_medium:value.default(''),utm_content:value.default(''),utm_term:value.default('')}).strict();
export const campaignInputSchema=z.object({name:z.string().trim().min(1).max(100).refine(text=>!/[\u0000-\u001f\u007f]/.test(text),'名称不能包含控制字符'),targetUrl:z.string().trim().min(1).max(2048).refine(text=>{try{const url=new URL(text);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!/[\u0000-\u001f\u007f]/.test(text);}catch{return false;}},'请输入不含账号密码的完整 HTTP 或 HTTPS 网址'),parameters:campaignParametersSchema}).strict();
export type CampaignInput=z.infer<typeof campaignInputSchema>;
/** Standard URL encoding preserves unrelated query parameters/fragments and IDN hostnames. */
export function buildCampaignUrl(input:CampaignInput):string{
 const value=campaignInputSchema.parse(input),url=new URL(value.targetUrl);
 for(const field of utmFields){if(value.parameters[field])url.searchParams.set(field,value.parameters[field]);else url.searchParams.delete(field);}
 const result=url.toString();
 if(result.length>2000)throw Object.assign(new Error('推广链接超过 2000 字符，请缩短网址或渠道参数'),{statusCode:400});
 return result;
}
