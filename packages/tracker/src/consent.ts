import {mountConsentBanner} from './consent-banner';
import type {Tracker} from './index';
const tracker=(window as unknown as {baize?:Tracker}).baize;
if(tracker&&!tracker.hasModule('consent')){
 tracker.registerModule('consent');
 void tracker.ready.then(()=>{
  if(!tracker.getConfig().consentRequired||tracker.isAllowed())return;
  const mount=()=>{if(document.body)mountConsentBanner(tracker);};
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
 });
}
