import { onCLS,onINP,onLCP,onFCP,onTTFB } from 'web-vitals/attribution';
import type { Tracker } from './index';
const tracker=(window as Window & {baize?:Tracker}).baize;
if(tracker&&tracker.registerModule('vitals')){let started=false;const change=(allowed:boolean)=>{if(started||!allowed||Math.random()>Math.min(1,Math.max(0,tracker.getConfig().sampleRate??1)))return;started=true;for(const [name,register] of Object.entries({cls:onCLS,inp:onINP,lcp:onLCP,fcp:onFCP,ttfb:onTTFB}))register(metric=>{if(tracker.isAllowed())tracker.emit('vitals',{vitals:{[name]:metric.value},props:{metric_id:metric.id,rating:metric.rating}});});};tracker.onConsent(change);void tracker.ready.then(()=>change(tracker.isAllowed()));}
