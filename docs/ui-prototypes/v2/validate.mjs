// Development-only harness; not needed by offline preview. Uses existing project Playwright.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.PROTOTYPE_BASE_URL||'http://127.0.0.1:3197';
const out=process.env.PROTOTYPE_EVIDENCE_DIR||'/tmp/baize-ui-v2-validation';await fs.mkdir(out,{recursive:true});
const report={scope:'independent synthetic offline UI prototypes only',transport:'loopback static server; file:// blocked by managed Chromium policy, not bypassed',checks:[],variants:{}};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const check=async(name,fn)=>{try{await fn();report.checks.push({name,status:'passed'});}catch(e){report.checks.push({name,status:'failed',error:e.message});}};
for(const variant of (process.env.PROTOTYPE_VARIANTS||'a,b').split(',').filter(v=>['a','b'].includes(v))){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],requests=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{requests.push(r.url());if(!r.url().startsWith(base+'/'))external.push(r.url());});
 const url=base+'/'+variant+'/index.html';await page.goto(url);
 const detail=page.locator(variant==='a'?'#point-detail':'#trend-detail');const metrics=page.locator(variant==='a'?'.metrics':'#metrics');
 await check(variant+' initial load and disclosure',async()=>{assert.equal(errors.length,0);assert.match(await page.locator('body').innerText(),/演示/);assert.match(await metrics.innerText(),/5,802/);});
 for(const period of ['7','30'])for(const metric of ['pv','uv','conversions'])await check(`${variant} ${period}d ${metric} real controls and daily evidence`,async()=>{
  await page.locator('#period').selectOption(period);await page.locator('#metric').selectOption(metric);
  assert.match(await page.locator('#range').innerText(),period==='7'?/2026-10-04/:/2026-09-11/);
  assert.match(await page.locator('#trend svg').getAttribute('aria-label'),metric==='pv'?/PV|浏览/:metric==='uv'?/UV|访客/:/转化/);
  const day=await page.evaluate(([period,metric])=>{const d=BaizeDemo.view(Number(period)).current[0];return {date:d.date,text:BaizeDemo.format(d[metric])};},[period,metric]);
  assert.match(await detail.innerText(),new RegExp(day.date));assert.ok((await detail.innerText()).includes(day.text));
 });
 await page.locator('#period').selectOption('7');await page.locator('#metric').selectOption('pv');
 await check(variant+' comparison toggles KPI line and detail',async()=>{await page.locator('#compare').uncheck();assert.equal(await page.locator('#trend [stroke-dasharray]').count(),0);assert.ok(!(await detail.innerText()).includes('前期'));assert.ok(!(await metrics.innerText()).match(/[+-]\d.*%/));await page.locator('#compare').check();assert.ok(await page.locator('#trend [stroke-dasharray]').count()>0);assert.match(await detail.innerText(),/前期/);});
 await check(variant+' keyboard day selection',async()=>{if(variant==='a'){await page.locator('.daily summary').click();const points=page.locator('#trend .point');await points.nth(0).focus();await page.keyboard.press('ArrowRight');}else{await page.locator('#day-controls button').first().focus();await page.keyboard.press('ArrowRight');}assert.match(await detail.innerText(),/2026-10-05/);});
 await check(variant+' pinned day survives hover',async()=>{if(variant==='a'){await page.locator('#trend .point').nth(1).click({force:true});await page.locator('#trend .point').nth(2).hover({force:true});}else{await page.locator('#day-controls button').nth(1).click();await page.locator('#day-controls button').nth(2).hover();}assert.match(await detail.innerText(),/2026-10-05/);});
 await check(variant+' annotation keyboard evidence',async()=>{const annotation=page.locator(variant==='a'?'#trend [aria-label*="人工备注"]':'#trend [data-annotation]').first();await annotation.focus();await page.keyboard.press('Enter');assert.match(await page.locator('body').innerText(),/接入指南更新/);assert.match(await page.locator('body').innerText(),/因果|收益/);});
 await page.goto(url);await page.locator('[data-page="analysis"]').first().click();
 await check(variant+' bounded source bars and four-step funnel',async()=>{assert.equal(await page.locator(variant==='a'?'#sources-analysis button':'#sources button').count(),5);assert.equal(await page.locator('#funnel .funnel-step').count(),4);assert.match(await page.locator('#funnel').innerText(),/480/);assert.match(await page.locator('#funnel').innerText(),/流失/);});
 await check(variant+' 7x24 heatmap and exact keyboard locator',async()=>{assert.equal(await page.locator('#heatmap button').count(),168);if(variant==='a'){await page.locator('#heat-select').selectOption('33');}else{await page.locator('#heat-day').selectOption('1');await page.locator('#heat-hour').selectOption('9');}assert.match(await page.locator('#heat-detail').innerText(),/周二.*09:00|周二.*9/);assert.match(await page.locator('#heat-detail').innerText(),/Asia\/Shanghai/);});
 await check(variant+' landing table sort changes order',async()=>{if(variant==='a'){const before=await page.locator('#pages tr').first().innerText();await page.locator('#sort').selectOption('path');assert.notEqual(await page.locator('#pages tr').first().innerText(),before);}else{await page.locator('#tab-data').click();await page.locator('#page-details summary').click();const before=await page.locator('#pages tr').first().innerText();await page.locator('[data-sort="pv"]').click();assert.notEqual(await page.locator('#pages tr').first().innerText(),before);}});
 await page.goto(url);await page.locator('[data-page="analysis"]').first().click();
 await check(variant+' source filtering changes all totals with evidence chip',async()=>{await page.locator(variant==='a'?'#sources-analysis button':'#sources button').first().click();if(variant==='b'){assert.ok(await page.locator('#filter-evidence').isVisible());await page.locator('#close-filter-evidence').click();}assert.match(await page.locator('#filter-chips').innerText(),/自然搜索/);const wanted=await page.evaluate(()=>BaizeDemo.format(BaizeDemo.view(7,{source:'自然搜索'}).totals.pv));assert.ok((await metrics.innerText()).includes(wanted));assert.ok(!((await metrics.innerText()).includes('5,802')));});
 await check(variant+' clear filter and back restores filtered evidence',async()=>{await page.locator('#filter-chips button').first().click();assert.match(await metrics.innerText(),/5,802/);await page.goBack();await page.waitForFunction(()=>document.querySelector('#filter-chips').textContent.includes('自然搜索'));assert.match(await page.locator('#filter-chips').innerText(),/自然搜索/);await page.reload();assert.match(await page.locator('#filter-chips').innerText(),/自然搜索/);});
 await page.goto(url);
 if(variant==='b')await page.locator('.preview-options summary').click();
 for(const state of ['loading','empty','error'])await check(`${variant} ${state} distinct state`,async()=>{await page.locator('#state').selectOption(state);const msg=page.locator(variant==='a'?'#status':'#state-message');assert.ok(await msg.isVisible());assert.ok(!(await page.locator('#trend').isVisible()));assert.match(await msg.innerText(),state==='loading'?/正在|加载/:state==='empty'?/没有|无数据|为空/:/未完成|失败|错误/);});await page.locator('#state').selectOption('ready');
 if(variant==='b'){
  await check('b dimension source plot and undo',async()=>{await page.locator('#dimension').selectOption('source');assert.equal(await page.locator('#trend [data-sourceplot]').count(),5);await page.locator('#trend [data-sourceplot]').first().focus();await page.keyboard.press('Enter');assert.ok(await page.locator('#filter-evidence').isVisible());await page.locator('#close-filter-evidence').click();await page.locator('#filter-chips button').first().click();await page.locator('#dimension').selectOption('day');});
  await check('b named in-memory view save restore and refresh clears',async()=>{await page.locator('#period').selectOption('30');await page.locator('#metric').selectOption('conversions');await page.locator('#save-view').click();await page.locator('#view-name').fill('内容复查');await page.locator('#save-form button[type="submit"]').click();await page.locator('#period').selectOption('7');await page.locator('#saved-picker').selectOption('0');assert.equal(await page.locator('#period').inputValue(),'30');assert.equal(await page.locator('#metric').inputValue(),'conversions');await page.reload();assert.ok(await page.locator('#saved-picker').isDisabled());});
 }
 await page.goto(url);await page.reload();
 const desktop=await page.locator('#trend svg').boundingBox();report.variants[variant]={desktopChart:desktop};
 await check(variant+' desktop plotting region at least 280px',async()=>{assert.ok(desktop.height>=344);});
 await page.screenshot({path:path.join(out,variant+'-overview-1440.png'),fullPage:true});
 await page.locator('[data-page="analysis"]').first().click();await page.screenshot({path:path.join(out,variant+'-analysis-1440.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('[data-page="overview"]').first().click();await page.evaluate(()=>window.scrollTo(0,0));
 const mobile=await page.locator('#trend svg').boundingBox();report.variants[variant].mobileChart=mobile;
 await check(variant+' mobile plotting region at least 220px and no whole-page overflow',async()=>{assert.ok(mobile.height>=280);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));});
 await page.screenshot({path:path.join(out,variant+'-mobile-390.png'),fullPage:true});
 await check(variant+' mobile heatmap scroll and fixed weekday',async()=>{await page.locator('[data-page="analysis"]').first().click();const before=await page.locator('.heat-scroll').evaluate(el=>({w:el.clientWidth,s:el.scrollWidth}));assert.ok(before.s>before.w);const weekday=page.locator(variant==='a'?'.weekday':'.heat-weekday').first();const x=(await weekday.boundingBox()).x;await page.locator('.heat-scroll').evaluate(el=>el.scrollLeft=180);assert.ok(Math.abs((await weekday.boundingBox()).x-x)<2);assert.ok(await page.locator('.heat-scroll').evaluate(el=>el.scrollLeft>0));});
 await check(variant+' no external requests or uncaught JS',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});report.variants[variant].requests=requests.length;await page.close();
}
await browser.close();report.passed=report.checks.filter(c=>c.status==='passed').length;report.failed=report.checks.filter(c=>c.status==='failed').length;report.skipped=0;await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,skipped:0,failedChecks:report.checks.filter(c=>c.status==='failed')}));if(report.failed)process.exitCode=1;
