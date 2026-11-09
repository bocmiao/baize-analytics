import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const base=process.env.BAIZE_PHP_HTTP_URL||'http://127.0.0.1:8099';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Only a disposable loopback PHP fixture may be tested');
const fixture=JSON.parse(readFileSync(process.env.BAIZE_PHP_HTTP_SESSION||'.baize/php-http/session.json','utf8'));
if(!/^[a-zA-Z0-9_-]{1,128}$/.test(fixture.siteId)||!fixture.cookie?.startsWith('baize_session='))throw Error('Private PHP HTTP fixture is unavailable');
const output=process.env.BAIZE_PHP_HTTP_EVIDENCE||'.baize/test-evidence/php';mkdirSync(output,{recursive:true});
const theme=process.env.BAIZE_PHP_BROWSER_THEME||'light';if(!['light','dark'].includes(theme))throw Error('Invalid browser theme');
const pass=process.env.BAIZE_PHP_BROWSER_PASS||'initial';if(!/^[a-z0-9-]{1,40}$/.test(pass))throw Error('Invalid evidence pass name');
const source=readFileSync('src/web/workspaceRoute.ts','utf8');
const grouped=[...source.matchAll(/reports:\[([^\]]+)\]/g)].flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
const reports=['overview','realtime',...grouped];if(reports.length!==39||new Set(reports).size!==39)throw Error('Review workspace report extraction after changing navigationGroups');
const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const scenarios=[{name:'few',from:day(-6),to:day(0)},{name:'empty',from:day(-14),to:day(-14)}];
const assets=[...readFileSync('php/public/index.html','utf8').matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(m=>({path:m[1],sha256:existsSync('php/public'+m[1])?createHash('sha256').update(readFileSync('php/public'+m[1])).digest('hex'):null}));
const evidence={startedAt:new Date().toISOString(),pass,theme,baseUrl:base,backend:'real PHP HTTP + MySQL',frontendAssets:assets,testSourceSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),syntheticFixture:true,interceptedBackendResponses:false,externalCallsRequested:false,reports,scenarios,views:[],screenshots:[],limitations:['No live provider calls, notification sends, destructive actions or purchases are requested.','The few-data fixture does not populate every management namespace. Empty lists are tested as empty lists, without pretending to test record editing.','Views requiring an existing report, identity, funnel, replay session or export ID are tested only through their workspace entry and available fixture records.','The updates workspace is observed read-only; the PHP runtime uses manual release upgrade instructions.']};
const evidencePath=`${output}/browser-${pass}-results.json`;
const persist=()=>writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
const redact=text=>String(text).replace(/baize_session=[^;\s"']+/g,'baize_session=[redacted]').slice(0,3000);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const numeric=x=>typeof x==='number'&&Number.isFinite(x);
function shape(body){if(Array.isArray(body))return {type:'array',length:body.length,itemKeys:obj(body[0])?Object.keys(body[0]).sort():[]};if(obj(body))return {type:'object',keys:Object.keys(body).sort(),arrays:Object.fromEntries(Object.entries(body).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))};return {type:typeof body};}
function contract(path,body){
 const failures=[];const need=(ok,why)=>{if(!ok)failures.push(why);};
 if(path==='/api/me')need(obj(body?.user)&&typeof body.user.id==='string'&&typeof body.user.is_admin==='boolean','me.user identity and boolean admin');
 else if(path==='/api/v1/sites')need(Array.isArray(body?.sites)&&body.sites.some(s=>s.id===fixture.siteId),'site list includes selected fixture');
 else if(path.endsWith('/stats')){need(obj(body?.totals)&&numeric(body.totals.pv),'stats totals.pv number');need(numeric(body?.coverage),'stats coverage number');for(const key of ['trend','pages','sources','dimensionRows','events'])need(Array.isArray(body?.[key]),'stats '+key+' array');need(obj(body?.audience),'stats audience object');}
 else if(path.endsWith('/content'))for(const key of ['downloads','notFound','eventTrend'])need(Array.isArray(body?.[key]),'content '+key+' array');
 else if(path.endsWith('/revenue')){need(obj(body?.revenueByCurrency),'revenueByCurrency object');need(Array.isArray(body?.trend)&&Array.isArray(body?.attribution),'revenue trend/attribution arrays');}
 else if(path.endsWith('/identities'))need(Array.isArray(body?.identities),'identities array');
 else if(path.endsWith('/realtime')){need(numeric(body?.online),'realtime online number');need(Array.isArray(body?.events),'realtime events array');}
 else if(path.endsWith('/analysis'))need(Array.isArray(body?.goals)&&Array.isArray(body?.funnels),'analysis goals/funnels arrays');
 else if(path.endsWith('/self-host-diagnostics')){need(obj(body?.database)&&typeof body.database.status==='string','diagnostics database status');need(obj(body?.redis)&&obj(body?.storage)&&obj(body?.settings),'diagnostics redis/storage/settings objects');}
 else if(path.endsWith('/intake-status'))need(typeof body?.stage==='string'&&body.snippetVerified===false,'intake stage and honest snippet verification');
 else if(path.endsWith('/annotations'))need(Array.isArray(body?.rows)&&typeof body.currentTimezone==='string','annotations rows and timezone');
 else if(path.endsWith('/manual-search'))need(Array.isArray(body?.imports)&&body.officialProviderVerified===false,'manual import list and provider disclaimer');
 else if(path.endsWith('/gsc')){need(Array.isArray(body?.rows)&&typeof body?.localImportStatus==='string','GSC rows and local import status');need(numeric(body?.returnedRows)&&numeric(body?.limit),'GSC returnedRows and limit numbers');}
 else if(path.endsWith('/ga4'))need(Array.isArray(body?.rows),'GA4 rows array');
 else if(path.endsWith('/seo/conversions'))need(Array.isArray(body?.rows)&&typeof body?.scope==='string','SEO comparison rows and scope');
 else if(path.endsWith('/external'))need(Array.isArray(body?.connections),'connections array');
 else if(path.endsWith('/seo/scans'))need(Array.isArray(body?.scans),'SEO scans array');
 else if(path.endsWith('/ai/usage'))for(const key of ['calls','budget','reservations'])need(Array.isArray(body?.[key]),'AI usage '+key+' array');
 else if(path.endsWith('/suggestions'))need(Array.isArray(body?.rows),'suggestions rows array');
 else if(/^\/api\/v1\/sites\/[^/]+\/(goals|funnels|heatmap|replay|experiments|reports|alerts|schedules|shares|members|tokens|audit|exports|channels)$/.test(path))need(Array.isArray(body),path.split('/').at(-1)+' collection array');
 return failures;
}
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
evidence.browserVersion=browser.version();
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(selected=>localStorage.setItem('baize-theme',selected),theme);
 await context.addCookies([{name:'baize_session',value:fixture.cookie.split('=').slice(1).join('='),url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 async function view(report,scenario,viewport='desktop'){
  const row={report,scenario:scenario.name,viewport,pageErrors:[],consoleErrors:[],network:[],requestsFailed:[],contractFailures:[],semanticFailures:[],exactMoney:[],fixtureObservations:[],alerts:[],screenshots:[]};
  let active=0,lastResponse=Date.now();const pending=new Set();
  const isApi=url=>url.startsWith(base+'/api/')||url===base+'/healthz';
  const onPageError=err=>row.pageErrors.push(redact(err.stack||err.message));
  const onConsole=msg=>{if(msg.type()==='error')row.consoleErrors.push(redact(msg.text()));};
  const onRequest=req=>{if(isApi(req.url())&&req.resourceType()!=='eventsource')active++;if(isApi(req.url())&&!['GET','HEAD','OPTIONS'].includes(req.method()))row.contractFailures.push('Unexpected non-read request: '+new URL(req.url()).pathname);};
  const onFinished=req=>{if(isApi(req.url())&&req.resourceType()!=='eventsource'){active=Math.max(0,active-1);lastResponse=Date.now();}};
  const onFailed=req=>{onFinished(req);if(isApi(req.url())&&!req.failure()?.errorText?.includes('ERR_ABORTED'))row.requestsFailed.push({path:new URL(req.url()).pathname,error:redact(req.failure()?.errorText||'unknown')});};
  const onResponse=response=>{if(!isApi(response.url()))return;const request=response.request(),url=new URL(response.url());const type=response.headers()['content-type']||'';const item={method:request.method(),path:url.pathname,query:url.search,status:response.status(),resourceType:request.resourceType(),contentType:type};row.network.push(item);if(request.resourceType()==='eventsource'){if(response.ok()&&!type.includes('text/event-stream'))row.contractFailures.push(url.pathname+': successful EventSource response is not text/event-stream');return;}const operation=(async()=>{if(!type.includes('json')){row.contractFailures.push(url.pathname+': expected JSON response, received '+(type||'no Content-Type'));return;}let body;try{body=await response.json();}catch{item.invalidJson=true;row.contractFailures.push(url.pathname+': invalid JSON response');return;}item.shape=shape(body);if(response.ok()){if(typeof body?.error==='string'&&body.error){item.errorCode=body.error;row.contractFailures.push(url.pathname+': HTTP success with error body '+redact(body.error));}const missing=contract(url.pathname,body);if(missing.length){item.contractFailures=missing;row.contractFailures.push(...missing.map(why=>url.pathname+': '+why));}if(url.pathname.endsWith('/stats')&&url.searchParams.get('from')?.startsWith(scenario.from))row.fixtureObservations.push({path:url.pathname,pv:body?.totals?.pv});if((report==='overview'&&url.pathname.endsWith('/stats'))||(report==='revenue'&&url.pathname.endsWith('/revenue'))){for(const [currency,amount] of Object.entries(body.revenueByCurrency??body.totals?.revenueByCurrency??{}))if(typeof amount==='string'&&/^\d+\.\d{7,}$/.test(amount)&&!/^0[.0]+$/.test(amount))row.exactMoney.push({currency,amount});}}else item.errorCode=typeof body?.code==='string'?body.code:typeof body?.error==='string'?body.error:undefined;})();pending.add(operation);operation.finally(()=>pending.delete(operation));};
  page.on('pageerror',onPageError);page.on('console',onConsole);page.on('request',onRequest);page.on('requestfinished',onFinished);page.on('requestfailed',onFailed);page.on('response',onResponse);
  const started=Date.now();
  try{
   await page.goto(base+'/app?'+new URLSearchParams({site:fixture.siteId,report,from:scenario.from,to:scenario.to}),{waitUntil:'domcontentloaded'});
   row.renderedTheme=await page.locator('html').getAttribute('data-theme');if(row.renderedTheme!==theme)row.semanticFailures.push('Requested theme did not render: '+theme);
   await page.locator('h1').first().waitFor({state:'visible',timeout:10000});
   for(let n=0;n<80;n++){await page.waitForTimeout(100);if(active===0&&Date.now()-lastResponse>=300)break;}
   await Promise.allSettled([...pending]);await page.waitForTimeout(180);
   row.heading=await page.locator('h1').allTextContents();row.workspace=await page.locator('.workspace-report-'+report).count()===1;
   row.alerts=(await page.locator('#workspace-main [role="alert"]').allTextContents()).map(redact);
   row.statuses=(await page.locator('#workspace-main [role="status"]').allTextContents()).map(redact);
   row.loading=await page.locator('#workspace-main [aria-busy="true"]').count();
   const text=await page.locator('#workspace-main').innerText().catch(()=>'');row.mainCharacters=text.length;row.tableRows=await page.locator('#workspace-main tbody tr').count();row.canvasCount=await page.locator('#workspace-main canvas').count();row.mainText=redact(text);
   if(report==='jobs'&&/PostgreSQL/.test(text))row.semanticFailures.push('PHP jobs view describes PostgreSQL persisted-event recovery');
   if(report==='updates'&&/执行增量更新|execute incremental update/i.test(text))row.semanticFailures.push('PHP manual-upgrade runtime still renders the Node incremental-update execution workflow');
   const ungroupedText=text.replace(/[,，\s]/g,'');for(const {currency,amount} of row.exactMoney)if(!ungroupedText.includes(amount))row.semanticFailures.push('Exact nonzero '+currency+' decimal from the real backend is not visible: '+amount);
   for(const observation of row.fixtureObservations)if(scenario.name==='few'?!(observation.pv>0):observation.pv!==0)row.semanticFailures.push('Real '+scenario.name+' fixture returned unexpected pageview count: '+observation.pv);
   if(report==='events'&&scenario.name==='few'&&!/signup/.test(text))row.semanticFailures.push('The real signup event is missing from the events workspace');
   if(report==='pages'&&scenario.name==='few'&&!/\/php-http/.test(text))row.semanticFailures.push('The real collected page path is missing from the pages workspace');
   row.invalidVisibleValues=[...text.matchAll(/\bNaN\b|\[object Object\]/g)].map(x=>x[0]);
   row.overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth>innerWidth+1,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('#workspace-main *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&s.visibility!=='hidden'&&s.display!=='none'&&(r.right>innerWidth+1||r.left< -1)&&!el.closest('.table-wrap');}).slice(0,8).map(el=>({tag:el.tagName,className:String(el.className).slice(0,120),width:Math.round(el.getBoundingClientRect().width)}))}));
   row.httpFailures=row.network.filter(n=>n.status>=400&&!(n.path==='/api/capabilities'&&n.status===404));
   row.passed=row.workspace&&row.mainCharacters>60&&!row.pageErrors.length&&!row.consoleErrors.length&&!row.httpFailures.length&&!row.requestsFailed.length&&!row.contractFailures.length&&!row.semanticFailures.length&&!row.invalidVisibleValues.length&&!row.overflow.document&&!row.loading;
   const selected=['overview','revenue','settings','seo','jobs','retention','realtime','gsc','ga4','updates'].includes(report);
   if((selected&&(viewport==='desktop'||['overview','revenue','settings'].includes(report)))||!row.passed){const path=`${output}/browser-${pass}-${viewport}-${scenario.name}-${report}.png`;await page.screenshot({path,fullPage:true});row.screenshots.push(path);evidence.screenshots.push(path);}
  }catch(error){row.error=redact(error?.stack||error);row.passed=false;try{const path=`${output}/browser-${pass}-${viewport}-${scenario.name}-${report}-error.png`;await page.screenshot({path,fullPage:true});row.screenshots.push(path);evidence.screenshots.push(path);}catch{}}
  finally{row.durationMs=Date.now()-started;page.off('pageerror',onPageError);page.off('console',onConsole);page.off('request',onRequest);page.off('requestfinished',onFinished);page.off('requestfailed',onFailed);page.off('response',onResponse);evidence.views.push(row);persist();console.log(JSON.stringify({report,scenario:scenario.name,viewport,passed:row.passed,pageErrors:row.pageErrors.length,httpFailures:row.httpFailures?.length||0,contractFailures:row.contractFailures.length,semanticFailures:row.semanticFailures.length,alerts:row.alerts.length,error:row.error}));}
 }
 for(const scenario of scenarios)for(const report of reports)await view(report,scenario);
 await page.setViewportSize({width:390,height:844});for(const scenario of scenarios)for(const report of ['overview','revenue','settings','seo','realtime','retention','members','privacy'])await view(report,scenario,'mobile');
 // A cookie-free browser must visibly return to login rather than render zero statistics.
 const anonymous=await browser.newContext({viewport:{width:1440,height:1000}});const anonPage=await anonymous.newPage();await anonPage.goto(base+'/app?site='+fixture.siteId+'&report=overview');await anonPage.waitForTimeout(700);evidence.anonymous={urlPath:new URL(anonPage.url()).pathname,heading:await anonPage.locator('h1').allTextContents(),loginVisible:await anonPage.locator('input[name="password"]').count()>0,statisticsVisible:await anonPage.locator('.overview-metrics').count()>0};await anonymous.close();
 evidence.completedAt=new Date().toISOString();evidence.summary={views:evidence.views.length,passed:evidence.views.filter(r=>r.passed).length,failed:evidence.views.filter(r=>!r.passed).length,pageErrors:evidence.views.reduce((sum,r)=>sum+r.pageErrors.length,0),contractFailures:evidence.views.reduce((sum,r)=>sum+r.contractFailures.length,0),semanticFailures:evidence.views.reduce((sum,r)=>sum+r.semanticFailures.length,0),bodyOverflow:evidence.views.filter(r=>r.overflow?.document).length,anonymousDenied:evidence.anonymous.loginVisible&&!evidence.anonymous.statisticsVisible};persist();
 console.log(JSON.stringify({evidence:evidencePath,summary:evidence.summary}));process.exitCode=evidence.summary.failed||!evidence.summary.anonymousDenied?1:0;
}finally{await browser.close();}
