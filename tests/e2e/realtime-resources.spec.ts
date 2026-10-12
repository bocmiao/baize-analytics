import {test,expect} from '@playwright/test';
import {navigateWorkspace} from './navigation';
test('realtime pauses hidden resources, resumes snapshots and serializes event refreshes',async({page})=>{
 await page.addInitScript(()=>{
  const scope=window as unknown as {streams:{closed:boolean;onmessage:((event:{data:string})=>void)|null}[];setHidden:(hidden:boolean)=>void};scope.streams=[];let hidden=false;
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
  scope.setHidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
  class Stream{closed=false;onmessage:((event:{data:string})=>void)|null=null;constructor(){scope.streams.push(this);}close(){this.closed=true;}}
  Object.defineProperty(window,'EventSource',{value:Stream});
 });
 let reads=0,inFlight=0,maxFlight=0;let release:(()=>void)|undefined;
 await page.route('**/api/v1/sites/*/realtime',async route=>{reads++;inFlight++;maxFlight=Math.max(maxFlight,inFlight);try{if(reads===2)await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({json:{online:reads,events:[]}});}finally{inFlight--;}});
 await page.goto('/app');await navigateWorkspace(page,'实时');await expect.poll(()=>reads).toBe(1);
 await page.evaluate(()=>{const scope=window as unknown as {setHidden:(value:boolean)=>void};scope.setHidden(true);});
 expect(await page.evaluate(()=>(window as unknown as {streams:{closed:boolean}[]}).streams.every(stream=>stream.closed))).toBe(true);
 const paused=reads;await page.waitForTimeout(700);expect(reads).toBe(paused);
 await page.evaluate(()=>(window as unknown as {setHidden:(value:boolean)=>void}).setHidden(false));await expect.poll(()=>reads).toBe(2);
 await page.evaluate(()=>{const stream=(window as unknown as {streams:{onmessage:((event:{data:string})=>void)|null}[]}).streams.at(-1)!;for(let i=0;i<5;i++)stream.onmessage?.({data:JSON.stringify({event_id:`fixture-${i}`,path:'/fixture'})});});
 await page.waitForTimeout(700);expect(reads).toBe(2);expect(maxFlight).toBe(1);release!();await expect.poll(()=>reads).toBe(3);
 await navigateWorkspace(page,'页面');expect(await page.evaluate(()=>(window as unknown as {streams:{closed:boolean}[]}).streams.every(stream=>stream.closed))).toBe(true);
});
