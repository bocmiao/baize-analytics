import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const base=process.env.BAIZE_PHP_HTTP_URL||'http://127.0.0.1:8099';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Disposable loopback fixtures only');
const fixture=JSON.parse(readFileSync(process.env.BAIZE_PHP_HTTP_SESSION||'.baize/php-heatmap-legacy-session.json','utf8'));
const output=process.env.BAIZE_PHP_HTTP_EVIDENCE||'docs/test-evidence/php-20261015/metadata';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:'baize_session',value:fixture.cookie.split('=').slice(1).join('='),url:base,httpOnly:true,sameSite:'Lax'}]);
 const response=await context.request.get(base+'/api/v1/sites/'+fixture.siteId+'/heatmap');assert.equal(response.status(),200);assert.ok(Array.isArray(await response.json()));assert.equal(response.headers()['x-baize-read-coverage'],'0');assert.equal(response.headers()['x-baize-read-status'],'historical_heatmap_coverage_unavailable');
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/app?site='+fixture.siteId+'&report=heatmap');
 await page.getByRole('status').filter({hasText:'空白不能证明历史访问为零'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:output+'/heatmap-missing-history-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/heatmap-missing-history-mobile.png',fullPage:true});
 const html=await (await context.request.get(base+'/')).text();
 const result={passed:8,backend:'real PHP HTTP + MySQL',syntheticFixture:'site created through API, created_at adjusted to 2020 to represent legacy history without retained original points',interceptedResponses:false,responseHeaders:Object.fromEntries(Object.entries(response.headers()).filter(([key])=>key.startsWith('x-baize-'))),frontendIndexSha256:createHash('sha256').update(html).digest('hex'),pageErrors:errors,noticeVisible:true,viewports:[1440,390]};
 writeFileSync(output+'/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
