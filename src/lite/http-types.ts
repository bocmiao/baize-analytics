import type {LiteInsightsOptions} from './optional-insights.js';
import type {LiteStorePort} from './types.js';
export interface LiteAppOptions {dataDir?:string;keyDir?:string;publicUrl?:string;store?:LiteStorePort;background?:boolean;allowLocalTest?:boolean;insightsTransport?:LiteInsightsOptions['transport']}
export const liteCapabilities={profile:'lite',reports:['overview','pages','sources','audience','events','vitals','goals','exports','privacy','settings','seo','ai'],capabilities:{identify:false,replay:false,heatmap:false,funnels:false,paths:false,retention:false,annotations:false,seo:true,ai:true,manualSEO:true,manualAI:true,distributed:false}};
