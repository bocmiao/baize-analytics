import {mountConsentBanner,consentLanguage} from './consent-banner';
import type {Tracker} from './index';
const selectedLanguage=consentLanguage((document.currentScript as HTMLScriptElement|null)?.dataset.language);
const tracker=(window as unknown as {baize?:Tracker}).baize;
if(tracker&&!tracker.hasModule('consent')){
 tracker.registerModule('consent');
 void tracker.ready.then(()=>{
  if(!tracker.getConfig().consentRequired||tracker.isAllowed())return;
  const mount=()=>{if(document.body)mountConsentBanner(tracker,document.body,{language:selectedLanguage});};
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
 });
}
