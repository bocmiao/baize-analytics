import {afterEach,it,expect,vi} from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
it('heatmap honors ignored, private, masked and editable ancestors before emission',async()=>{
 const handlers=new Map<string,(event:{target:unknown;pageX:number;pageY:number})=>void>();const emitted:unknown[]=[];let allowed=true;
 class ElementFixture{constructor(private marker:string){}closest(selector:string){return selector.split(',').includes(this.marker)?this:null;}}
 vi.stubGlobal('Element',ElementFixture);vi.stubGlobal('innerWidth',375);vi.stubGlobal('innerHeight',667);vi.stubGlobal('document',{documentElement:{scrollWidth:375,scrollHeight:1000},addEventListener:(name:string,handler:typeof handlers extends Map<string,infer H>?H:never)=>handlers.set(name,handler)});vi.stubGlobal('window',{baize:{registerModule:()=>true,ready:Promise.resolve(),getConfig:()=>({heatmap:true}),onPage:()=>{},isAllowed:()=>allowed,emit:(...args:unknown[])=>emitted.push(args)}});
 vi.resetModules();await import('../../packages/tracker/src/heatmap');await Promise.resolve();const click=handlers.get('click')!;
 for(const marker of ['[data-baize-ignore]','[data-private]','[data-baize-private]','[data-baize-mask]','.baize-private','.rr-mask','.rr-block','input','textarea','select','[contenteditable]'])click({target:new ElementFixture(marker),pageX:100,pageY:200});expect(emitted).toHaveLength(0);
 allowed=false;click({target:new ElementFixture('public'),pageX:100,pageY:200});expect(emitted).toHaveLength(0);allowed=true;click({target:new ElementFixture('public'),pageX:100,pageY:200});expect(emitted).toEqual([['heatmap',{heatmap:{kind:'click',x:0.27,y:0.2,width:375,height:667}}]]);
});
