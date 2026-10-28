import {test,expect,type Browser,type Page} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {createApp,fixtureInstallationNonce} from '../helpers/install-fixture';
import {isolatedTestConnectionString} from '../support/database-url';
import {runWorkerOnce} from '../../src/server/worker';
import {revealDateInputs,closeDateSheet} from './navigation';

const out=process.env.BAIZE_PR3_EVIDENCE_DIR||'.baize/pr3-ui';
async function fixture(browser:Browser,run:(f:{page:Page;runtime:Awaited<ReturnType<typeof createApp>>;siteId:string;origin:string})=>Promise<void>){
 if(!process.env.TEST_DATABASE_URL)throw Error('UI review requires an explicit disposable TEST_DATABASE_URL');
 const root=await mkdtemp('/tmp/baize-pr3-ui-'),schema='pr3_ui_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:2});
 await admin.query('CREATE SCHEMA '+schema);
 const runtime=await createApp({pool,redis:null,clickhouse:null,history:null,background:false,dataDir:root+'/data',keyDir:root+'/keys',publicUrl:'http://127.0.0.1'});
 const origin=await runtime.app.listen({host:'127.0.0.1',port:0});runtime.ctx.config.publicUrl=origin;
 const context=await browser.newContext({baseURL:origin,reducedMotion:'reduce',viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  expect((await page.request.post('/api/setup',{data:{installationNonce:fixtureInstallationNonce,email:'pr3-owner@example.test',password:'SyntheticPr3Owner2026!',name:'界面回归演示'}})).status()).toBe(200);
  const response=await page.request.post('/api/v1/sites',{data:{name:'白泽真实接口回归 · 合成演示',domain:'pr3-ui.example.test',timezone:'UTC',privacy_mode:'standard',retention_days:90}});expect(response.status()).toBe(201);
  await run({page,runtime,siteId:(await response.json()).site.id,origin});expect(errors).toEqual([]);
 }finally{await context.close();await runtime.app.close();await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();await rm(root,{recursive:true,force:true});}
}
async function capture(page:Page,name:string,details:Record<string,unknown>={}){
 await mkdir(out,{recursive:true});await page.evaluate(()=>document.fonts.ready);
 const image=await page.screenshot({path:`${out}/${name}.png`,fullPage:true,mask:[page.locator('a[href*="/invite/"]')]});
 await writeFile(`${out}/${name}.json`,JSON.stringify({synthetic:true,mockedStatistics:false,backend:'Real Node PostgreSQL APIs',viewport:page.viewportSize(),sha256:createHash('sha256').update(image).digest('hex'),frontendIndexSha256:createHash('sha256').update(await readFile('dist/web/index.html')).digest('hex'),...details},null,2)+'\n');
}
test('one-time invitation survives member reload failure, offline retry and narrow layout; viewer writes stay forbidden',async({browser})=>{
 test.setTimeout(90000);
 await fixture(browser,async({page,siteId,origin})=>{
  const day=new Date().toISOString().slice(0,10);await page.goto(`/app?site=${siteId}&report=members&from=${day}&to=${day}`);
  const editor=page.getByRole('heading',{name:'待接受邀请',exact:true}).locator('..');await expect(editor).toBeVisible();
  await editor.getByLabel('成员邮箱',{exact:true}).fill('pr3-viewer@example.test');
  let failRead=true;
  await page.route('**/api/v1/sites/*/members?**',async route=>{if(failRead)await route.fulfill({status:503,json:{error:'Synthetic member reload failure'}});else await route.continue();});
  const saved=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/invites'));
  await editor.getByRole('button',{name:'生成邀请链接',exact:true}).click();const response=await saved;expect(response.status()).toBe(200);const invitation=await response.json();
  await expect(page.locator('main').getByRole('button',{name:'重试',exact:true})).toBeVisible();
  await capture(page,'members-reload-error');
  const link=editor.getByRole('link');await expect(link).toHaveAttribute('href',invitation.url);
  failRead=false;await page.locator('main').getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.member-roster')).toContainText('pr3-owner@example.test');await expect(link).toHaveAttribute('href',invitation.url);
  await page.setViewportSize({width:320,height:800});await capture(page,'members-mobile-320');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // A failed invite request must keep form input and the previous one-time link.
  await editor.getByLabel('成员邮箱',{exact:true}).fill('pr3-retry@example.test');await page.context().setOffline(true);await editor.getByRole('button',{name:'生成邀请链接',exact:true}).click();await expect(editor.getByRole('alert')).toBeVisible();await expect(link).toHaveAttribute('href',invitation.url);await expect(editor.getByLabel('成员邮箱',{exact:true})).toHaveValue('pr3-retry@example.test');await page.context().setOffline(false);
  const retried=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/invites'));await editor.getByRole('button',{name:'生成邀请链接',exact:true}).click();expect((await retried).status()).toBe(200);await expect(editor.getByRole('alert')).toHaveCount(0);
  const token=new URL(invitation.url).pathname.split('/').pop();expect((await page.request.post(`/api/v1/invites/${token}/register`,{data:{name:'合成只读成员',password:'SyntheticPr3Viewer2026!'}})).status()).toBe(200);
  const guest=await browser.newContext({baseURL:origin});try{expect((await guest.request.post('/api/login',{data:{email:'pr3-viewer@example.test',password:'SyntheticPr3Viewer2026!'}})).status()).toBe(200);expect((await guest.request.post(`/api/v1/sites/${siteId}/invites`,{data:{email:'forbidden@example.test',role:'admin'}})).status()).toBe(403);const viewerPage=await guest.newPage();await viewerPage.goto(`/app?site=${siteId}&report=members&from=${day}&to=${day}`);await expect(viewerPage.getByRole('heading',{name:'此视图需要站点管理员权限',exact:true})).toBeVisible();await expect(viewerPage.getByRole('button',{name:'生成邀请链接',exact:true})).toHaveCount(0);await expect(viewerPage.locator('option[value="_add_site_"]')).toHaveCount(0);}finally{await guest.close();}
 });
});
test('real ISO event timestamps render minute bars and visit clocks; unavailable online count stays unknown',async({browser})=>{
 test.setTimeout(90000);
 await fixture(browser,async({page,siteId,runtime})=>{
  const now=Date.now(),events=[0,1,2].map(index=>({event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),type:'pageview',ts:now-index*61000,path:'/真实长中文页面/'+index,url:'https://pr3-ui.example.test/真实长中文页面/'+index}));
  expect((await page.request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize PR3 real browser fixture'},data:{protocol_version:1,site_id:siteId,sdk:'tracker.js/1.0.0',sent_at:now,events}})).status()).toBe(202);
  await runWorkerOnce(runtime.ctx.pool);const live=await (await page.request.get(`/api/v1/sites/${siteId}/realtime`)).json();expect(live.events).toHaveLength(3);expect(typeof live.events[0].ts).toBe('string');expect(live.events[0].ts).toMatch(/T.*Z$/);
  const day=new Date().toISOString().slice(0,10);await page.goto(`/app?site=${siteId}&report=realtime&from=${day}&to=${day}`);await expect(page.locator('.visit-stream li')).toHaveCount(3);await expect(page.locator('.visit-stream li').first().locator('span')).toHaveText('/真实长中文页面/0');await capture(page,'realtime-desktop',{actualTimestampType:typeof live.events[0].ts,actualTimestampExample:live.events[0].ts});
  await expect(page.locator('.minute-bars i')).toHaveCount(30);await expect(page.locator('.visit-stream time').first()).not.toHaveText('—');await expect(page.getByTestId('realtime-total')).toHaveText('3');
  // A manual snapshot refresh must preserve pause and leave Resume reachable.
  let streams=0;page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/realtime/stream'))streams++;});
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  for(const width of [1440,320]){
   await page.setViewportSize({width,height:900});await revealDateInputs(page);
   const snapshot=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/sites/${siteId}/realtime`);
   await page.getByRole('button',{name:'刷新',exact:true}).click();expect((await snapshot).ok()).toBe(true);await closeDateSheet(page);
   await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();await expect(page.locator('.visit-stream li')).toHaveCount(3);expect(streams).toBe(0);
  }
  let failSnapshot=true;await page.route('**/api/v1/sites/*/realtime',route=>failSnapshot?route.fulfill({status:503,json:{error:'Synthetic paused refresh failure'}}):route.continue());
  await revealDateInputs(page);await page.getByRole('button',{name:'刷新',exact:true}).click();await closeDateSheet(page);await expect(page.getByRole('alert')).toContainText('503');
  failSnapshot=false;await page.locator('main').getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();await expect(page.locator('.visit-stream li')).toHaveCount(3);expect(streams).toBe(0);await page.unroute('**/api/v1/sites/*/realtime');
  const resumed=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/realtime/stream'));await page.getByRole('button',{name:'继续',exact:true}).click();await resumed;await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const visit=page.locator('.visit-stream li').first(),pathBounds=(await visit.locator('span').boundingBox())!,visitBounds=(await visit.boundingBox())!;expect(pathBounds.width).toBeGreaterThan(visitBounds.width*.8);expect(pathBounds.y).toBeGreaterThan((await visit.locator('time').boundingBox())!.y);await capture(page,'realtime-mobile-320');
  await page.route('**/api/v1/sites/*/realtime',route=>route.fulfill({json:{...live,online:99,onlineCoverage:0}}));await page.reload();await expect(page.locator('.realtime-online strong')).toHaveText('—');
  const summary=page.getByRole('heading',{name:'实时完整窗口汇总',exact:true}).locator('..');await expect(summary.locator('p').first()).toHaveText('近 5 分钟活跃：—');
  const revenueEvents=[0,1].map(index=>({event_id:randomUUID(),visitor_id:events[0]!.visitor_id,page_id:randomUUID(),type:'revenue',ts:now-index*61000,path:'/order',url:'https://pr3-ui.example.test/order',revenue:0.01,currency:'USD',order_id:randomUUID()}));
  const collectedRevenue=await page.request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize PR3 revenue fixture'},data:{protocol_version:1,site_id:siteId,sdk:'tracker.js/1.0.0',sent_at:Date.now(),events:revenueEvents}});expect(collectedRevenue.status()).toBe(202);expect(await collectedRevenue.json()).toMatchObject({accepted:2,rejected:[]});await runWorkerOnce(runtime.ctx.pool);
  await page.addInitScript(()=>{const paints:{text:string;color:string}[]=[];(window as unknown as {axisPaints:typeof paints}).axisPaints=paints;const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args:Parameters<CanvasRenderingContext2D['fillText']>){if(paints.length<5000)paints.push({text:String(args[0]),color:String(this.fillStyle)});return original.apply(this,args);};});
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/app?site=${siteId}&report=revenue&from=${day}&to=${day}&theme=dark&motion=off`);await expect(page.locator('[data-money-chart="true"] canvas')).toBeVisible();
  const axis=await page.evaluate(day=>{const palette=getComputedStyle(document.documentElement).getPropertyValue('--ink2').trim(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.fillStyle=palette;const color=String(ctx.fillStyle),paints=(window as unknown as {axisPaints:{text:string;color:string}[]}).axisPaints;return {color,dateLabels:paints.filter(paint=>paint.text.includes(day.slice(5).replace('-', '/')))};},day);expect(axis.dateLabels.length).toBeGreaterThan(0);expect(axis.dateLabels.every(label=>label.color===axis.color)).toBe(true);await capture(page,'revenue-dark-axis-colors',{axis});

 });
});
test('page segments require their actual counts and never substitute bounce rate for exits',async({browser})=>{
 test.setTimeout(90000);
 await fixture(browser,async({page,siteId})=>{
  const day=new Date().toISOString().slice(0,10);
  let pages:Record<string,unknown>[]=[{path:'/high-bounce',pv:1,entries:1,bounceRate:1},{path:'/low-bounce',pv:100,entries:20,bounceRate:0}];
  await page.route('**/api/v1/sites/*/stats?**',route=>route.fulfill({json:{coverage:1,pages,sources:[],audience:{}}}));
  await page.goto(`/app?site=${siteId}&report=pages&from=${day}&to=${day}`);
  const table=page.locator('main > .panel').filter({has:page.getByRole('heading',{name:'页面数据',exact:true})}).locator('table').first();
  await expect(page.getByRole('button',{name:'入口页',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'退出页',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'入口页',exact:true}).click();await expect(table.locator('tbody tr').first()).toContainText('/low-bounce');
  pages=[{path:'/high-bounce',pv:1,entries:1,exits:1,bounceRate:1},{path:'/low-bounce',pv:100,entries:20,exits:20,bounceRate:0}];
  await revealDateInputs(page);await page.getByRole('button',{name:'刷新',exact:true}).click();await closeDateSheet(page);await page.getByRole('button',{name:'退出页',exact:true}).click();await expect(table.locator('tbody tr').first()).toContainText('/low-bounce');
  pages=[{path:'/first',pv:1,bounceRate:0},{path:'/second',pv:2,bounceRate:1}];
  await revealDateInputs(page);await page.getByRole('button',{name:'刷新',exact:true}).click();await closeDateSheet(page);await expect(table.locator('tbody tr').first()).toContainText('/first');await expect(page.getByRole('button',{name:'退出页',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'入口页',exact:true})).toHaveCount(0);
 });
});
test('merged site directory keeps real scoped navigation, retry and mobile overflow containment',async({browser})=>{
 test.setTimeout(90000);
 await fixture(browser,async({page,siteId})=>{
  const day=new Date().toISOString().slice(0,10);let failRead=true;
  await page.route('**/api/v1/sites/*/stats?**',route=>failRead?route.fulfill({status:503,json:{error:'Synthetic directory read failure'}}):route.continue());
  await page.goto(`/app?site=${siteId}&report=sites&from=${day}&to=${day}`);
  await expect(page.getByRole('button',{name:'重试读取',exact:true})).toBeVisible();
  await expect(page.locator('.directory-summary article').nth(2).locator('strong')).toHaveText('—');
  failRead=false;await page.getByRole('button',{name:'重试读取',exact:true}).click();
  await expect(page.locator('.site-directory [role="status"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'重试读取',exact:true})).toHaveCount(0);
  const link=page.locator('.directory-table').getByRole('link',{name:'白泽真实接口回归 · 合成演示',exact:true});
  await expect(link).toHaveAttribute('href',new RegExp(`site=${siteId}&report=overview`));
  await expect(page.locator('#workspace-navigation a[href*="report=visits"]')).toHaveCount(0);
  for(const width of [1440,320]){await page.setViewportSize({width,height:900});await capture(page,`directory-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.getByLabel('搜索站点',{exact:true}).fill('no matching site');await expect(page.getByText('没有匹配的站点',{exact:true})).toBeVisible();await page.getByLabel('搜索站点',{exact:true}).fill('');await link.click();await expect(page.locator('h1')).toHaveText('总览');
  await page.setViewportSize({width:1440,height:900});await page.locator('select.sidebar-site-select').selectOption('_add_site_');await expect(page.getByRole('heading',{name:'添加站点',exact:true})).toBeVisible();
  for(const width of [1440,320]){await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.locator('.preview-note')).toContainText('示意数据');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,`landing-${width}`);}
 });
});
