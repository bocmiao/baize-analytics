import {test,expect} from '@playwright/test';
import {navigateWorkspace} from './navigation';
const profile={profile:'lite',reports:['overview','pages','sources','audience','events','vitals','goals','exports','privacy','settings'],capabilities:{identify:false,replay:false,heatmap:false,funnels:false,paths:false,distributed:false}};
test('Lite hides unsupported navigation and rejects deep links before view requests',async({page})=>{
 await page.route('**/api/capabilities',route=>route.fulfill({json:profile}));
 const unsupported:string[]=[];page.on('request',request=>{if(/\/api\/v1\/sites\/[^/]+\/(funnels|replay)(?:\?|$)/.test(request.url()))unsupported.push(request.url());});
 await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();
 await expect(page.locator('#workspace-navigation').getByRole('link',{name:'回放',exact:true,includeHidden:true})).toHaveCount(0);
 await navigateWorkspace(page,'站点设置');await expect(page.getByRole('heading',{name:'采集同意',exact:true})).toBeVisible();await expect(page.getByText('实例级企业 SSO 设置',{exact:true})).toHaveCount(0);
 const url=new URL(page.url());url.searchParams.set('report','replay');await page.goto(url.toString());await expect(page.getByRole('heading',{name:'Lite 暂不支持此功能'})).toBeVisible();await page.getByRole('link',{name:'返回总览',exact:true}).click();await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();expect(unsupported).toEqual([]);
});
test('missing capability endpoint keeps standard navigation',async({page})=>{
 await page.route('**/api/capabilities',route=>route.fulfill({status:404,json:{error:'not_found'}}));await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();await expect(page.locator('#workspace-navigation').getByRole('link',{name:'回放',exact:true,includeHidden:true})).toHaveCount(1);
});
test('actual Lite collection, event goals, export, retention boundary and mobile flow',async({page,request})=>{
 const capability=await request.get('/api/capabilities');expect((await capability.json()).profile).toBe('lite');
 const siteResponse=await request.post('/api/v1/sites',{data:{name:'Lite browser acceptance',domain:'lite-browser.example.test',timezone:'UTC',privacy_mode:'standard',retention_days:1}});expect(siteResponse.status()).toBe(201);const {site}=await siteResponse.json();
 const today=new Date().toISOString().slice(0,10),scope=`site=${site.id}&from=${today}&to=${today}`;
 await page.goto(`/app?${scope}&report=goals`);await expect(page.getByRole('heading',{name:'目标',exact:true})).toBeVisible();await expect(page.getByLabel('目标类型').locator('option')).toHaveCount(1);
 await page.getByLabel('目标名称',{exact:true}).fill('Actual signup');await page.getByLabel('事件名称',{exact:true}).fill('signup');await page.getByRole('button',{name:'保存目标',exact:true}).click();await expect(page.getByRole('cell',{name:'Actual signup',exact:true}).first()).toBeVisible();
 const ts=Date.now(),visitor_id=crypto.randomUUID(),page_id=crypto.randomUUID();const pageview={event_id:crypto.randomUUID(),type:'pageview',ts,visitor_id,page_id,url:'https://lite-browser.example.test/acceptance',path:'/acceptance'};
 const envelope={protocol_version:1,site_id:site.id,sdk:'tracker.js/1.0.0',sent_at:ts,events:[pageview,{...pageview,event_id:crypto.randomUUID(),type:'event',event_name:'signup'}]};
 const collect=await request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize Lite real acceptance'},data:envelope});expect(collect.status()).toBe(202);expect((await collect.json()).accepted).toBe(2);
 const replay=await request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize Lite real acceptance'},data:envelope});expect((await replay.json()).duplicates).toBe(2);
 await page.goto(`/app?${scope}&report=overview`);await expect.poll(async()=>{const response=await request.get(`/api/v1/sites/${site.id}/stats?from=${today}T00:00:00.000Z&to=${today}T23:59:59.999Z`);return (await response.json()).totals.pv;}).toBe(1);await expect(page.locator('.overview-metrics strong').first()).toHaveText('1');
 await navigateWorkspace(page,'目标');await expect(page.getByText('Actual signup',{exact:true}).first()).toBeVisible();
 await navigateWorkspace(page,'数据导出');await page.getByRole('button',{name:'创建后台导出',exact:true}).click();const download=page.getByRole('link',{name:/^下载/}).first();await expect(download).toBeVisible({timeout:15000});const file=await request.get((await download.getAttribute('href'))!);expect(file.status()).toBe(200);expect(await file.text()).toContain('/acceptance');
 const old=new Date(Date.now()-7*86400000).toISOString().slice(0,10);await page.goto(`/app?site=${site.id}&report=overview&from=${old}&to=${old}`);await expect(page.getByText('当前范围只有部分数据。缺记录不显示为 0。',{exact:true})).toBeVisible();await expect(page.locator('.overview-metrics strong').first()).toHaveText('—');
 await page.setViewportSize({width:390,height:844});await page.goto(`/app?${scope}&report=overview`);await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await navigateWorkspace(page,'站点设置');await expect(page.getByRole('heading',{name:'采集同意',exact:true})).toBeVisible();await page.getByLabel('采集前要求同意').check();await page.getByRole('button',{name:'保存同意设置'}).click();await expect(page.getByText('同意设置已保存。',{exact:true})).toBeVisible();const updated=await request.get(`/api/v1/sites/${site.id}`);expect((await updated.json()).site.config.consent_required).toBe(true);
});
test('event coverage does not claim complete session metrics across retired prefixes',async({page})=>{
 await page.route('**/api/capabilities',route=>route.fulfill({json:profile}));
 await page.route('**/api/v1/sites/*/stats?**',route=>route.fulfill({json:{coverage:1,watermark:new Date().toISOString(),rangeStatus:'complete',sessionMetricsStatus:'unavailable_retention_prefix',limitations:['Retired session prefixes prevent exact session starts.'],storage:{rollups:'sqlite'},totals:{pv:1,uv:1,sessions:null,bounceRate:null,averageDuration:null,conversions:null},pages:[],sources:[],trend:[]}}));
 await page.goto('/app');await expect(page.getByText('事件已齐，没有会话指标',{exact:true})).toBeVisible();await expect(page.getByText('保留期之前的会话补不回来。会话数、跳出、时长和目标没有数。',{exact:true})).toBeVisible();await expect(page.locator('.overview-metrics strong').nth(2)).toHaveText('—');await page.getByText('查看数据口径 / 详情',{exact:true}).click();await expect(page.getByText('Retired session prefixes prevent exact session starts.',{exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'unavailable_retention_prefix',exact:true})).toBeVisible();
});
