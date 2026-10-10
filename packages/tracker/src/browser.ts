import { createTracker, type Tracker, type TrackerEvent } from './index';
declare global { interface Window { baize?: Tracker; [key: string]: unknown } }
const script=document.currentScript as HTMLScriptElement|null;
if(script){const d=script.dataset;const id=d.siteId||d.websiteId;if(id){const hook=d.beforeSend?window[d.beforeSend]:undefined;window.baize=createTracker({siteId:id,apiHost:d.apiHost||new URL(script.src,location.href).origin,consentRequired:d.consentRequired==='true',allowIframe:d.allowIframe==='true',forms:d.form==='true',downloadExts:d.downloadExts,sampleRate:Number(d.sampleRate||1),beforeSend:typeof hook==='function'?hook as (event:TrackerEvent)=>TrackerEvent|null:undefined});}}
