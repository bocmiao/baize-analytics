import {test,expect,type Browser,type Page} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {createApp,fixtureInstallationNonce,prepareInstallationFixture} from '../helpers/install-fixture';
import {createLiteApp} from '../../src/lite/app';
import {runWorkerOnce} from '../../src/server/worker';
import {isolatedTestConnectionString} from '../support/database-url';
import {openWorkspaceAccount} from './navigation';

const out=process.env.BAIZE_OVERVIEW_EVIDENCE_DIR||'.baize/pr2-ui-evidence';
type Options={standard?:boolean;storageBlocked?:boolean;unfinished?:boolean;controlledStats?:boolean};
async function workspace(browser:Browser,options:Options,run:(fixture:{page:Page;origin:string;siteId:string;url:string;errors:string[]})=>Promise<void>){
 const root=await mkdtemp('/tmp/baize-pr2-ui-'),schema='pr2_ui_'+randomUUID().replaceAll('-','');
 const admin=options.standard?new Pool({connectionString:process.env.TEST_DATABASE_URL}):undefined;
 const pool=options.standard?new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:2}):undefined;
 if(admin)await admin.query('CREATE SCHEMA '+schema);
 await prepareInstallationFixture(root+'/keys');
 const runtime=pool?await createApp({pool,redis:null,clickhouse:null,history:null,background:false,dataDir:root+'/data',keyDir:root+'/keys',publicUrl:'http://127.0.0.1'}):await createLiteApp({dataDir:root+'/data',keyDir:root+'/keys',publicUrl:'http://127.0.0.1',background:false});
 const origin=await runtime.app.listen({host:'127.0.0.1',port:0});
 if(pool)(runtime as Awaited<ReturnType<typeof createApp>>).ctx.config.publicUrl=origin;
 const context=await browser.newContext({baseURL:origin,reducedMotion:'reduce',viewport:{width:1440,height:1000}});
 try{
  await context.addInitScript(({blocked})=>{
   if(blocked){Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Storage blocked by fixture','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Storage blocked by fixture','SecurityError');}});}
   const observed:string[]=[];(window as unknown as {observedCanvasText:string[]}).observedCanvasText=observed;
   const original=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,...args){observed.push(text);if(observed.length>10000)observed.splice(0,5000);return original.call(this,text,...args as [number,number,number?]);};
  },{blocked:options.storageBlocked===true});
  const setup=await context.request.post('/api/setup',{data:{installationNonce:fixtureInstallationNonce,email:'pr2-ui@example.test',password:'SyntheticPr2Ui2026!',name:'PR2 合成验收'}});expect(setup.status()).toBe(200);
  const created=await context.request.post('/api/v1/sites',{data:{name:'青玉墨玉 · 合成验收',domain:'pr2-ui.example.test',timezone:'UTC',privacy_mode:'standard',retention_days:90}});expect(created.status()).toBe(201);const siteId=(await created.json()).site.id as string;
  if(pool)for(let n=0;n<8&&await runWorkerOnce(pool);n++){/* Drain only this isolated fixture. */}
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const day=options.unfinished?new Date().toISOString().slice(0,10):'2026-10-01';
  if(options.controlledStats){
   await page.route('**/api/v1/sites/*/stats?**',route=>{
    const from=new URL(route.request().url()).searchParams.get('from')!,current=from.slice(0,10)===day,start=+new Date(from),end=start+86400000;
    return route.fulfill({json:{coverage:1,watermark:new Date().toISOString(),from,effectiveFrom:from,to:new Date(end).toISOString(),effectiveTo:new Date(current&&options.unfinished?Date.now():end).toISOString(),futureClamped:current&&options.unfinished===true,totals:{pv:current?83:29,uv:current?20:10,sessions:current?21:11,bounceRate:.25,averageDuration:12,conversions:0},trend:[42,20,21].map((value,index)=>({time:new Date(start+index*3600000).toISOString(),pv:current?value:index+8,uv:index+1,sessions:index+1})),sources:[{channel:'direct',pv:83}],pages:[{path:'/真实长中文页面路径/青玉与墨玉主题的比较数据',pv:83,uv:20,entries:21,averageDuration:12}],audience:{country:{unknown:83},device:{desktop:83}},goals:{},funnels:{}}});
   });
  }
  const url=`${origin}/app?site=${siteId}&report=overview&from=${day}&to=${day}`;
  await run({page,origin,siteId,url,errors});expect(errors).toEqual([]);
 }finally{await context.close();await runtime.app.close();if(pool)await pool.end();if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}await rm(root,{recursive:true,force:true});}
}
async function capture(page:Page,name:string,controlledStats:boolean){
 if(process.env.BAIZE_UI_NEGATIVE==='1')return;
 await mkdir(out,{recursive:true});await page.evaluate(()=>document.fonts.ready);
 const bytes=await page.screenshot({path:join(out,name+'.png'),fullPage:true});
 await writeFile(join(out,name+'.json'),JSON.stringify({syntheticFixture:true,controlledStats,backend:controlledStats?'Real SQLite authentication/site APIs with explicitly controlled statistics':'Real Node PostgreSQL APIs; no intercepted responses',viewport:page.viewportSize(),sha256:createHash('sha256').update(bytes).digest('hex'),frontendIndexSha256:createHash('sha256').update(await readFile('dist/web/index.html')).digest('hex'),sourceSha256:Object.fromEntries(await Promise.all(['src/web/theme.ts','src/web/ThemeToggle.tsx','src/web/OverviewDashboard.tsx','src/web/evidenceTooltip.ts','src/web/design-v2.css','src/web/main.tsx'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])))},null,2)+'\n');
}
async function openOverview(page:Page,url:string){await page.goto(url);await expect(page.locator('.approved-overview')).toBeVisible();await expect(page.locator('.chart canvas').first()).toBeVisible();}
async function themeState(page:Page,dark:boolean){
 await expect(page.locator('html')).toHaveAttribute('data-theme',dark?'dark':'light');
 await expect.poll(()=>page.locator('.theme-toggle').evaluateAll(elements=>elements.map(element=>element.getAttribute('aria-pressed')))).toEqual([''+dark,''+dark,''+dark]);
 await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content',dark?'#0A0A0A':'#FAFAFA');
 const contrast=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true})!;
  const rgba=(color:string)=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
  const luminance=(color:number[])=>{const rgb=color.slice(0,3).map(value=>{const part=value/255;return part<=.04045?part/12.92:((part+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  return ['.compare-toggle','.workspace button.overview-insight-toggle','.workspace main>.panel:has(>.segment-filters)>summary','.overview-insight-evidence p'].map(selector=>{
   const element=document.querySelector<HTMLElement>(selector)!;let ancestor:HTMLElement|null=element;const layers:number[][]=[];
   while(ancestor){layers.push(rgba(getComputedStyle(ancestor).backgroundColor));ancestor=ancestor.parentElement;}
   let background=[255,255,255];for(const layer of layers.reverse())background=background.map((value,index)=>layer[index]*layer[3]/255+value*(1-layer[3]/255));
   const foreground=rgba(getComputedStyle(element).color),a=luminance(foreground),b=luminance(background);
   return {selector,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
 });
 for(const check of contrast)expect(check.ratio,JSON.stringify(check)).toBeGreaterThanOrEqual(4.5);
}

test('comparison controls current/previous facts, chart and legend together on desktop',async({browser})=>{
 await workspace(browser,{controlledStats:true},async({page,url})=>{
  await openOverview(page,url);const chart=page.locator('[data-comparison-points]').first();await expect(chart).toHaveAttribute('data-comparison-points','3');
  await page.getByRole('checkbox',{name:'对比',exact:true}).focus();await page.keyboard.press('Space');await expect(chart).toHaveAttribute('data-comparison-points','0');await expect(page.locator('.overview-trend-legend .previous')).toHaveCount(0);await expect(page.locator('.overview-metrics tbody tr')).toHaveCount(1);await expect(page.locator('.overview-metrics strong').first()).toHaveText('83');await expect(page.locator('.overview-mobile-metrics dd span')).toHaveCount(0);await capture(page,'comparison-off-desktop',true);
  await page.getByRole('checkbox',{name:'对比',exact:true}).check();await expect(chart).toHaveAttribute('data-comparison-points','3');await expect(page.locator('.overview-metrics tbody tr')).toHaveCount(3);await expect(page.locator('.overview-trend-legend .previous')).toBeVisible();await capture(page,'comparison-on-desktop',true);
 });
});
test('comparison stays operable on a narrow screen and preserves current metrics',async({browser})=>{
 await workspace(browser,{controlledStats:true},async({page,url})=>{
  await page.setViewportSize({width:390,height:844});await openOverview(page,url);await expect(page.locator('.overview-comparison-scroll')).toBeHidden();const toggle=page.getByRole('checkbox',{name:'对比',exact:true});await expect(toggle).toBeVisible();await toggle.focus();await page.keyboard.press('Space');await expect(toggle).not.toBeChecked();await expect(page.locator('[data-comparison-points]').first()).toHaveAttribute('data-comparison-points','0');await expect(page.locator('.overview-mobile-metrics dd span')).toHaveCount(0);await expect(page.locator('.overview-mobile-metrics strong').first()).toHaveText('83');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,'comparison-off-mobile',true);await toggle.check();await expect(page.locator('.overview-mobile-metrics dd span')).toHaveCount(6);await expect(page.locator('[data-comparison-points]').first()).toHaveAttribute('data-comparison-points','3');
 });
});
test('unfinished today renders a real canvas tooltip with no comparison series',async({browser})=>{
 await workspace(browser,{controlledStats:true,unfinished:true},async({page,url})=>{
  await openOverview(page,url);const chart=page.locator('[data-comparison-points]').first();await expect(chart).toHaveAttribute('data-comparison-points','0');
  const box=(await chart.boundingBox())!;await page.mouse.move(box.x+58+(box.width-58-24)*5/6,box.y+box.height/2);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {observedCanvasText:string[]}).observedCanvasText.some(text=>text.includes('未完结')))).toBe(true);await capture(page,'unfinished-today-tooltip',true);
 });
});
test('every theme control and live chart follow same-page and cross-tab changes',async({browser})=>{
 await workspace(browser,{controlledStats:true},async({page,url})=>{
  await openOverview(page,url);await themeState(page,false);const instance=await page.locator('.chart[_echarts_instance_]').first().getAttribute('_echarts_instance_');
  await page.locator('.workspace-toolbar .theme-toggle').click();await themeState(page,true);await capture(page,'dark-desktop',true);const account=await openWorkspaceAccount(page);await account.locator('.theme-toggle').click();await themeState(page,false);
  const second=await page.context().newPage();await second.goto(url);await expect(second.locator('.approved-overview')).toBeVisible();await second.locator('.workspace-toolbar .theme-toggle').click();await themeState(second,true);await themeState(page,true);expect(await page.locator('.chart[_echarts_instance_]').first().getAttribute('_echarts_instance_')).toBe(instance);await second.close();
  await page.setViewportSize({width:390,height:844});await page.locator('.v3-header > .theme-toggle').click();await themeState(page,false);await page.locator('.v3-header > .theme-toggle').click();await themeState(page,true);await capture(page,'dark-mobile',true);
 });
});
test('denied browser storage does not break startup, toggling or URL-selected dark theme',async({browser})=>{
 await workspace(browser,{controlledStats:true,storageBlocked:true},async({page,url})=>{
  await openOverview(page,url);await themeState(page,false);await page.locator('.workspace-toolbar .theme-toggle').click();await themeState(page,true);await page.locator('.workspace-toolbar .theme-toggle').click();await themeState(page,false);await page.goto(url+'&theme=dark');await expect(page.locator('.approved-overview')).toBeVisible();await themeState(page,true);await capture(page,'storage-denied-dark',true);
 });
});
test('only login/setup use the split artwork; real share and invitation flows remain single column',async({browser})=>{
 test.setTimeout(120000);
 await workspace(browser,{standard:true},async({page,origin,siteId})=>{
  await page.goto(origin+'/login');await expect(page.locator('.login')).toBeVisible();await expect(page.getByRole('heading',{name:'登录白泽',exact:true})).toBeVisible();await expect(page.locator('.lart')).toHaveCount(0);await capture(page,'login-desktop',false);await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();await expect(page.locator('.lart')).toHaveCount(0);await capture(page,'login-mobile',false);
  const share=await page.request.post(`/api/v1/sites/${siteId}/shares`,{data:{password:'SyntheticShare2026!'}});expect(share.status()).toBe(200);const shareToken=(await share.json()).token;
  const invitation=await page.request.post(`/api/v1/sites/${siteId}/invites`,{data:{email:'pr2-viewer@example.test',role:'viewer'}});expect(invitation.status()).toBe(200);const inviteToken=(await invitation.json()).token;
  const guest=await browser.newContext({baseURL:origin,reducedMotion:'reduce',viewport:{width:1440,height:1000}}),guestPage=await guest.newPage();
  try{
   await guestPage.goto(origin+'/share/'+shareToken);await expect(guestPage.locator('.auth')).toHaveCSS('display','block');await expect(guestPage.locator('.auth')).toHaveCSS('max-width','620px');const bounds=(await guestPage.locator('section.panel').boundingBox())!;expect(bounds.width).toBeGreaterThan(500);await guestPage.getByLabel('分享密码',{exact:true}).fill('SyntheticShare2026!');await guestPage.getByRole('button',{name:'打开只读看板',exact:true}).click();await expect(guestPage.getByText('仅展示被授权的汇总信息，不提供站点配置与原始明细。')).toBeVisible();await expect(guestPage.locator('.chart canvas')).toBeVisible();await capture(guestPage,'share-desktop',false);await guestPage.setViewportSize({width:390,height:844});expect(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(guestPage,'share-mobile',false);await guestPage.setViewportSize({width:1440,height:1000});
   await guestPage.goto(origin+'/invite/'+inviteToken+'?theme=dark');await expect(guestPage.locator('.auth')).toHaveCSS('display','block');await expect(guestPage.locator('.auth')).toHaveCSS('max-width','620px');await capture(guestPage,'invite-dark-desktop',false);await guestPage.setViewportSize({width:390,height:844});expect(await guestPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(guestPage,'invite-dark-mobile',false);await guestPage.getByLabel('姓名',{exact:true}).fill('合成只读成员');await guestPage.getByLabel('设置密码',{exact:true}).fill('SyntheticInvite2026!');await guestPage.getByRole('button',{name:'注册并接受邀请',exact:true}).click();await expect(guestPage.getByRole('link',{name:'使用受邀邮箱登录',exact:true})).toBeVisible();
  }finally{await guest.close();}
 });
});
