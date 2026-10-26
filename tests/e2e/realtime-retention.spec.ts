import {navigateWorkspace,revealDateInputs} from './navigation';
import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('complete realtime Top exceeds 200-row preview and retention never renders immature days as zero',async({page})=>{
 test.setTimeout(90000);
 const response=await page.request.post('/api/v1/sites',{data:{name:`真实实时与留存 ${Date.now()}`,domain:'realtime-retention.example.test',timezone:'UTC',privacy_mode:'standard',tags:[]}});expect(response.ok()).toBeTruthy();const site=(await response.json()).site;
 const now=Date.now(),day=(offset:number)=>new Date(now+offset*86400000).toISOString().slice(0,10),at=(offset:number)=>Date.parse(`${day(offset)}T10:00:00Z`);
 const visitors=[randomUUID(),randomUUID(),randomUUID()];
 const event=(visitor:string,ts:number,path:string)=>({event_id:randomUUID(),type:'pageview',ts,visitor_id:visitor,page_id:randomUUID(),url:`https://realtime-retention.example.test${path}`,path,title:'真实验收'});
 async function collect(events:ReturnType<typeof event>[]){const result=await page.request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize acceptance'},data:{protocol_version:1,site_id:site.id,sdk:'tracker.js/1.0.0',sent_at:Date.now(),events}});expect(result.status()).toBe(202);}
 await collect([...visitors.map(visitor=>event(visitor,at(-3),'/cohort')),event(visitors[0]!,at(-2),'/returned'),event(visitors[1]!,at(-1),'/returned')]);
 const range=`from=${day(-3)}T00:00:00.000Z&to=${new Date(now).toISOString()}`;
 await expect.poll(async()=>{const r=await page.request.get(`/api/v1/sites/${site.id}/stats?${range}`);const s=await r.json();return s.cohorts?.[day(-3)]?.observations?.['1']?.status==='complete';},{timeout:30000}).toBe(true);
 await page.goto('/app');await page.getByLabel('选择站点').selectOption(site.id);await (await revealDateInputs(page), page).getByLabel('开始',{exact:true}).fill(day(-3));await navigateWorkspace(page, "留存");
 const cohort=page.getByRole('heading',{name:'首访同期群留存热图'}).locator('..');const row=cohort.getByRole('row').filter({has:page.getByRole('rowheader',{name:day(-3),exact:true})});
 await expect(row.getByRole('cell',{name:'33.3%',exact:true})).toHaveCount(2);await expect(row.getByRole('cell').nth(3)).toHaveText('—');await expect(row.getByRole('cell').nth(3)).toHaveAttribute('title','尚未成熟');
 await navigateWorkspace(page, "实时");await expect(page.getByTestId('realtime-total')).toHaveText('0');
 for(let batch=0;batch<5;batch++)await collect(Array.from({length:48},(_,index)=>event(randomUUID(),Date.now(),index<40?'/popular':'/other')));
 await expect(page.getByTestId('realtime-total')).toHaveText('240',{timeout:30000});
 const top=page.getByRole('region',{name:'实时Top页面'});await expect(top.getByRole('row').filter({has:page.getByRole('cell',{name:'/popular',exact:true})}).getByRole('cell',{name:'200',exact:true})).toHaveCount(2);await expect(top.getByRole('cell',{name:'/other',exact:true})).toBeVisible();await expect(page.getByText('下方事件仅为最近200条预览，不能作为完整流量或Top统计。')).toBeVisible();
 const live=await page.request.get(`/api/v1/sites/${site.id}/realtime`);const data=await live.json();expect(data.events).toHaveLength(200);expect(data.realtime.pv).toBe(240);expect(data.topPages.find((item:{path:string})=>item.path==='/popular').pv).toBe(200);
});
