import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {observeChartSize} from '../../src/web/Charts.js';
function luminance(hex:string){const rgb=hex.replace('#','').match(/../g)!.map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('responsive presentation safeguards',()=>{
 it('fixed small product labels meet WCAG AA on their declared backgrounds',()=>{const css=readFileSync(new URL('../../src/web/style.css',import.meta.url),'utf8');for(const [selector,background] of [['.watermark','#f5f8f5'],['.empty','#ffffff'],['.sidebar-label','#f1f5ef'],['.metrics span','#ffffff'],['.language','#f1f5ef'],['th','#f8faf7'],['.quality.fair','#fff4cf'],['small,.hint','#f5f8f5'],['.eyebrow','#f5f8f5'],['.landing footer','#f5f8f5']]){const declarations=css.split('}').find(rule=>rule.trim().split('{')[0]===selector)?.split('{')[1]??'';const foreground=declarations.match(/(?:^|;)color:(#[\da-f]{6})/)?.[1];expect(foreground,selector).toBeDefined();expect(contrast(foreground!,background),selector).toBeGreaterThanOrEqual(4.5);}});
 it('coalesces container and window resizing and cancels queued work on cleanup',()=>{
  let observerCallback:()=>void=()=>{},frameCallback:()=>void=()=>{};
  const observe=vi.fn(),disconnect=vi.fn(),addEventListener=vi.fn(),removeEventListener=vi.fn();
  const requestAnimationFrame=vi.fn((callback:()=>void)=>{frameCallback=callback;return 7;}),cancelAnimationFrame=vi.fn();
  class Observer{constructor(cb:()=>void){observerCallback=cb;}observe=observe;disconnect=disconnect;}
  vi.stubGlobal('ResizeObserver',Observer);vi.stubGlobal('window',{addEventListener,removeEventListener,requestAnimationFrame,cancelAnimationFrame});
  try{const resize=vi.fn(),element={} as HTMLElement;const stop=observeChartSize(element,{resize});expect(observe).toHaveBeenCalledWith(element);
   observerCallback();observerCallback();addEventListener.mock.calls[0][1]();expect(resize).not.toHaveBeenCalled();expect(requestAnimationFrame).toHaveBeenCalledOnce();
   frameCallback();expect(resize).toHaveBeenCalledOnce();observerCallback();stop();expect(cancelAnimationFrame).toHaveBeenCalledWith(7);expect(disconnect).toHaveBeenCalledOnce();expect(removeEventListener).toHaveBeenCalledWith('resize',addEventListener.mock.calls[0][1]);
  }finally{vi.unstubAllGlobals();}
 });
});
