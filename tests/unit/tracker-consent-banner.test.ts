import {afterEach,it,expect,vi} from 'vitest';
import {mountConsentBanner} from '../../packages/tracker/src/consent-banner';
import type {Tracker} from '../../packages/tracker/src/index';
afterEach(()=>vi.unstubAllGlobals());
it.each(['zh-CN','en'] as const)('renders fixed %s consent and removes banner before grant or revoke',language=>{
 class Node{children:Node[]=[];textContent='';onclick?:()=>void;removed=false;attributes:Record<string,string>={};append(...children:Node[]){this.children.push(...children);}setAttribute(k:string,v:string){this.attributes[k]=v;}remove(){this.removed=true;}}
 const parent=new Node();vi.stubGlobal('document',{createElement:()=>new Node(),body:parent});let granted=0,revoked=0;const tracker={grantConsent(){expect(parent.children[0]!.removed).toBe(true);granted++;},revokeConsent(){expect(parent.children[1]!.removed).toBe(true);revoked++;}} as Tracker;
 mountConsentBanner(tracker,parent as unknown as HTMLElement,{language});expect(granted+revoked).toBe(0);const box=parent.children[0]!;expect(box.attributes['aria-label']).toBe(language==='en'?'Privacy preferences':'隐私设置');expect(box.children[1]!.textContent).toBe(language==='en'?'Accept':'同意');box.children[1]!.onclick!();mountConsentBanner(tracker,parent as unknown as HTMLElement,{language});parent.children[1]!.children[2]!.onclick!();expect({granted,revoked}).toEqual({granted:1,revoked:1});
});
