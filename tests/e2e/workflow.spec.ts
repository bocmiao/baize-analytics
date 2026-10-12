import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {navigateWorkspace,openWorkspaceAccount} from './navigation';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('product landing is the default, login is an explicit action', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: /看懂每一次访问，.*找到下一步增长/ })).toBeVisible(); await expect(page.getByRole('link', { name: '登录', exact: true })).toBeVisible(); await expect(page.locator('input[type=password]')).toHaveCount(0); });
test('real administrator → site → durable collection → aggregate → Chinese dashboard', async ({ page, request }) => {
    const setup = await request.get('/api/setup');
    expect(setup.ok()).toBeTruthy();
    const { required } = await setup.json();
    if (required) {
        await page.goto('/setup');
        await page.getByLabel('安装凭证', { exact: true }).fill(fixtureInstallationNonce);
        await page.getByLabel('姓名', { exact: true }).fill('验收管理员');
        await page.getByLabel('邮箱', { exact: true }).fill('acceptance@example.test');
        await page.getByLabel('密码', { exact: true }).fill('BaizeAcceptance2026!');
        await page.getByRole('button', { name: '创建管理员', exact: true }).click();
        await expect(page.getByRole('heading', { name: '添加第一个站点' })).toBeVisible();
        await page.getByLabel('站点名称').fill('真实验收站点');
        await page.getByLabel('域名', { exact: true }).fill('example.test');
        await page.getByRole('button', { name: '创建站点', exact: true }).click();
        await expect(page.getByRole('heading', { name: '安装追踪代码' })).toBeVisible();
        await page.getByRole('link', { name: '进入看板' }).click();
    }
    else {
        await page.goto('/login');
        await page.getByLabel('邮箱', { exact: true }).fill('acceptance@example.test');
        await page.getByLabel('密码', { exact: true }).fill('BaizeAcceptance2026!');
        await page.getByRole('button', { name: '登录', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible();
    const sitesResponse = await page.request.get('/api/v1/sites');
    expect(sitesResponse.ok()).toBeTruthy();
    const sites = await sitesResponse.json();
    const site = (Array.isArray(sites) ? sites : sites.sites)[0];
    const beforeResponse = await page.request.get(`/api/v1/sites/${site.id}/stats`);
    const beforeStats = await beforeResponse.json();
    const beforePV = Number(beforeStats.pages?.find((p: {
        path: string;
    }) => p.path === '/acceptance')?.pv || 0);
    const visitor = randomUUID();
    const event = { event_id: randomUUID(), type: 'pageview', ts: Date.now(), visitor_id: visitor, page_id: randomUUID(), url: 'https://example.test/acceptance', path: '/acceptance', title: '真实浏览器验收' };
    const collect = await page.request.post('/api/collect', { headers: { 'User-Agent': 'Mozilla/5.0 Baize acceptance' }, data: { protocol_version: 1, site_id: site.id, sdk: 'tracker.js/1.0.0', sent_at: Date.now(), events: [event] } });
    expect(collect.status()).toBe(202);
    const repeat = await page.request.post('/api/collect', { headers: { 'User-Agent': 'Mozilla/5.0 Baize acceptance' }, data: { protocol_version: 1, site_id: site.id, sdk: 'tracker.js/1.0.0', sent_at: Date.now(), events: [event] } });
    expect(repeat.status()).toBe(202);
    await expect.poll(async () => { const r = await page.request.get(`/api/v1/sites/${site.id}/stats`); const result = await r.json(); return result.coverage === 1 && +new Date(result.watermark) >= event.ts && result.pages?.some((p: {
        path: string;
        pv: number;
    }) => p.path === '/acceptance' && p.pv === beforePV + 1); }, { timeout: 30000 }).toBe(true);
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.screenshot({ path: 'docs/screenshots/dashboard-acceptance.png', fullPage: true });
    await navigateWorkspace(page, "页面");
    await expect(page.getByRole('cell', { name: '/acceptance', exact: true })).toBeVisible();
    await openWorkspaceAccount(page);await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: /看懂每一次访问，.*找到下一步增长/ })).toBeVisible();
    const unauthenticated = await page.request.get(`/api/v1/sites/${site.id}/stats`);
    expect(unauthenticated.status()).toBe(401);
});
test('tracker consent does not identify or transmit before grant and stops after revoke', async ({ browser, request, baseURL }) => {
    const login = await request.get('/api/me');
    expect(login.ok()).toBeTruthy();
    const r = await request.post('/api/v1/sites', { data: { name: 'Consent browser acceptance', domain: new URL(baseURL!).hostname, timezone: 'Asia/Shanghai', privacy_mode: 'standard', tags: [] } });
    expect(r.ok()).toBeTruthy();
    const raw = await r.json();
    const site = raw.site;
    expect(site).toBeTruthy();
    const context = await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'});
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await context.newPage();
    let collectCount = 0;
    page.on('request', req => { if (req.url().includes('/api/collect'))
        collectCount++; });
    await page.route(`${baseURL}/consent-acceptance`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>同意验收</title></head><body><h1>测试宿主页面</h1><script async src="${baseURL}/tracker.js" data-site-id="${site.id}" data-api-host="${baseURL}" data-consent-required="true"></script></body></html>` }));
    await page.goto(`${baseURL}/consent-acceptance`);
    await page.waitForFunction(() => Boolean((window as unknown as {
        baize: unknown;
    }).baize));
    await page.waitForTimeout(2300);
    expect(collectCount).toBe(0);
    expect((await context.cookies()).some(c => c.name === '_baize_uid')).toBe(false);
    await page.evaluate(() => (window as unknown as {
        baize: {
            grantConsent: () => void;
        };
    }).baize.grantConsent());
    await expect.poll(() => collectCount, { timeout: 10000 }).toBeGreaterThan(0);await expect.poll(async()=>{const stats=await request.get(`/api/v1/sites/${site.id}/stats`);return (await stats.json()).pages?.find((p:{path:string})=>p.path==='/consent-acceptance')?.pv;},{timeout:30000}).toBe(1);
    await page.evaluate(() => (window as unknown as {
        baize: {
            revokeConsent: () => void;
        };
    }).baize.revokeConsent());
    await page.waitForTimeout(200);
    const after = collectCount;
    await page.evaluate(() => (window as unknown as {
        baize: {
            track: (name: string) => void;
        };
    }).baize.track('must_not_collect'));
    await page.waitForTimeout(2300);
    expect(collectCount).toBe(after);
    await context.close();
});
test('real goal, funnel, saved report, protected share and revocation workflows', async ({ page, browser }) => {
    const suffix = Date.now();
    const goalName = `验收注册目标 ${suffix}`, funnelName = `验收两步漏斗 ${suffix}`, reportName = `验收报表 ${suffix}`;
    await page.goto('/login');
    await page.getByLabel('邮箱', { exact: true }).fill('acceptance@example.test');
    await page.getByLabel('密码', { exact: true }).fill('BaizeAcceptance2026!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible();
    await navigateWorkspace(page, "目标");
    await page.getByLabel('目标名称').fill(goalName);
    await page.getByLabel('事件名称').fill('signup');
    await page.getByRole('button', { name: '保存目标' }).click();
    await expect(page.getByRole('cell', { name: goalName, exact: true }).first()).toBeVisible();
    await navigateWorkspace(page, "漏斗");
    await page.getByLabel('漏斗名称').fill(funnelName);
    await page.getByLabel('路径或事件名').nth(0).fill('/acceptance');
    await page.getByLabel('路径或事件名').nth(1).fill('/thanks');
    await page.getByRole('button', { name: '保存漏斗' }).click();
    await expect(page.getByRole('cell', { name: funnelName, exact: true }).first()).toBeVisible();
    // Definition writes invalidate published facts; a saved definition is not a ready aggregate.
    const activeSiteId = await page.getByLabel('选择站点').inputValue();
    expect(activeSiteId).not.toBe('');
    await expect.poll(async () => {
        const response = await page.request.get(`/api/v1/sites/${encodeURIComponent(activeSiteId)}/stats`);
        const body = await response.json();
        if (response.status() === 503 && ['aggregate_source_changed', 'aggregation_pending'].includes(body.error)) return false;
        if (response.status() !== 200) throw new Error(`Unexpected aggregate readiness response: HTTP ${response.status()}, code ${String(body.error)}`);
        return body.coverage === 1 && body.watermark != null;
    }, { timeout: 30000, intervals: [250, 500, 1000], message: 'Goal and funnel changes must have a complete published aggregate before sharing' }).toBe(true);
    await navigateWorkspace(page, "报表");
    await page.getByLabel('报表名称').fill(reportName);
    await page.getByRole('button', { name: '保存筛选报表' }).click();
    await expect(page.getByRole('cell', { name: reportName, exact: true })).toBeVisible();
    await navigateWorkspace(page, "分享");
    await page.getByLabel('访问密码（可选，至少 8 位）').fill('Readonly2026!');
    await page.getByRole('button', { name: '生成只读链接' }).click();
    const link = page.getByRole('status').getByRole('link');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const context = await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'});
    const readonly = await context.newPage();
    await readonly.goto(href!);
    await readonly.getByLabel('分享密码').fill('Readonly2026!');
    await readonly.getByRole('button', { name: '打开只读看板' }).click();
    await expect(readonly.getByText('仅展示被授权的汇总信息，不提供站点配置与原始明细。')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '吊销', exact: true }).last().click();
    await readonly.reload();
    await expect(readonly.getByRole('heading', { name: '查看分享看板' })).toBeVisible();
    await context.close();
});
test('core English interface preference and Chinese reset', async ({ page }) => { await page.goto('/'); await page.getByLabel('界面语言 / Interface language').selectOption('en'); await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible(); await page.getByLabel('界面语言 / Interface language').selectOption('zh-CN'); await expect(page.getByRole('link', { name: '登录', exact: true })).toBeVisible(); });
test('invited viewer registration is scoped and cannot administer other sites', async ({ request, browser, baseURL }) => { const login = await request.get('/api/me'); expect(login.ok()).toBeTruthy(); const r = await request.get('/api/v1/sites'); const all = (await r.json()).sites; const site = all[0]; const email = `viewer-${Date.now()}@example.test`; const invite = await request.post(`/api/v1/sites/${site.id}/invites`, { data: { email, role: 'viewer' } }); expect(invite.ok()).toBeTruthy(); const { token } = await invite.json(); const context = await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'}); const page = await context.newPage(); await page.goto(`${baseURL}/invite/${token}`); await page.getByLabel('姓名', { exact: true }).fill('受邀只读成员'); await page.getByLabel('设置密码', { exact: true }).fill('ScopedViewer2026!'); await page.getByRole('button', { name: '注册并接受邀请' }).click(); await expect(page.getByRole('link', { name: '使用受邀邮箱登录' })).toBeVisible(); await page.getByRole('link', { name: '使用受邀邮箱登录' }).click(); await page.getByLabel('邮箱', { exact: true }).fill(email); await page.getByLabel('密码', { exact: true }).fill('ScopedViewer2026!'); await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible(); const sites = await page.request.get('/api/v1/sites'); expect((await sites.json()).sites).toHaveLength(1); const forbidden = await page.request.post(`/api/v1/sites/${site.id}/goals`, { data: { name: 'not-authorized', type: 'event', config: { event_name: 'signup' } } }); expect(forbidden.status()).toBe(403); if (all[1]) {
    const isolated = await page.request.get(`/api/v1/sites/${all[1].id}/stats`);
    expect(isolated.status()).toBe(403);
} await context.close(); });

test('opened realtime view receives a newly persisted event and heartbeat online count without refresh',async({page})=>{await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();const r=await page.request.get('/api/v1/sites');const site=(await r.json()).sites[0];const before=await page.request.get(`/api/v1/sites/${site.id}/realtime`);const baseline=(await before.json()).online;await navigateWorkspace(page, "实时");await expect(page.getByRole('heading',{name:'实时',exact:true})).toBeVisible();const path=`/live-${randomUUID()}`,visitor_id=randomUUID(),page_id=randomUUID(),ts=Date.now();const collect=await page.request.post('/api/collect',{headers:{'User-Agent':'Mozilla/5.0 Baize SSE acceptance'},data:{protocol_version:1,site_id:site.id,sdk:'tracker.js/1.0.0',sent_at:ts,events:[{event_id:randomUUID(),type:'pageview',ts,visitor_id,page_id,url:`https://${site.domain}${path}`,path},{event_id:randomUUID(),type:'heartbeat',ts:ts+1000,visitor_id,page_id,url:`https://${site.domain}${path}`,path,visible_ms:1000,interval_start:ts,interval_end:ts+1000}]}});expect(collect.status()).toBe(202);expect((await collect.json()).accepted).toBe(2);await expect(page.getByRole('cell',{name:path,exact:true}).first()).toBeVisible({timeout:10000});expect(typeof baseline).toBe('number');await expect(page.getByText(`近 5 分钟活跃：${baseline+1}`,{exact:true})).toBeVisible({timeout:10000});});

test('local immutable evidence → suggestion states → actual recheck → verified without a paid model',async({page})=>{await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();await navigateWorkspace(page, "建议复检");await page.getByRole('button',{name:'固定当前范围的事实快照'}).click();await expect(page.getByText(/来源 local-aggregate · 外部模型调用 false/)).toBeVisible();const title=`事实整改验收 ${Date.now()}`;await page.getByLabel('整改建议标题').fill(title);await page.getByRole('button',{name:'创建证据关联建议'}).click();await expect(page.getByLabel('选择建议').getByRole('option',{name:`${title} · 新发现`})).toHaveCount(1);await page.getByLabel('选择建议').selectOption({label:`${title} · 新发现`});for(const [state,label]of [['accepted','已接受'],['in-progress','处理中']] as const){await page.getByLabel('下一状态').selectOption(state);await page.getByRole('button',{name:'保存整改状态'}).click();await expect(page.getByText(`当前状态：${label}`,{exact:false})).toBeVisible();}await page.getByLabel('下一状态').selectOption('pending-recheck');await page.getByLabel('实施时间（必填）').fill('2026-10-10T08:00');await page.getByRole('button',{name:'保存整改状态'}).click();await expect(page.getByText('当前状态：已修复待复检',{exact:false})).toBeVisible();await page.getByLabel('复检开始日期').fill('2026-10-10');await page.getByLabel('复检结束日期').fill('2026-10-10');await page.getByLabel('干扰因素（每行一个，必填）').fill(`验收采集事件量波动
未控制同期其他改动`);await page.getByRole('button',{name:'执行复检'}).click();await expect(page.getByText('已保存复检证据')).toBeVisible();await page.getByLabel('下一状态').selectOption('verified');await page.getByRole('button',{name:'保存整改状态'}).click();await expect(page.getByText('当前状态：已验证',{exact:false})).toBeVisible();});

test('Chinese dashboard remains usable at mobile width without page overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/screenshots/dashboard-mobile-acceptance.png',fullPage:true});});

test('actual opted-in rrweb and heatmap collection render the safe replay UI and heatmap',async({page,browser,baseURL})=>{test.setTimeout(60000);expect((await page.request.get('/api/me')).ok()).toBeTruthy();const r=await page.request.post('/api/v1/sites',{data:{name:`P2 real recorder ${Date.now()}`,domain:new URL(baseURL!).hostname,timezone:'Asia/Shanghai',privacy_mode:'standard',config:{consent_required:true,replay:true,heatmap:true},tags:[]}});expect(r.ok()).toBeTruthy();const site=(await r.json()).site;const context=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'});await context.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));const host=await context.newPage();await host.route(`${baseURL}/replay-acceptance`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><title>P2 真实记录验收</title></head><body><h1>宿主页面</h1><input aria-label="私密输入"/><button id="public-action">实际按钮</button><script async src="${baseURL}/tracker.js" data-site-id="${site.id}" data-api-host="${baseURL}"></script></body></html>`}));await host.goto(`${baseURL}/replay-acceptance`);await host.waitForFunction(()=>Boolean((window as unknown as {baize:unknown}).baize));expect(await host.locator('script[src*="tracker-replay"]').count()).toBe(0);await host.evaluate(()=>(window as unknown as {baize:{grantConsent:()=>void}}).baize.grantConsent());await host.waitForFunction(()=>(window as unknown as {baize:{hasModule:(name:string)=>boolean}}).baize.hasModule('replay')&&(window as unknown as {baize:{hasModule:(name:string)=>boolean}}).baize.hasModule('heatmap'));const secret=`NEVER-PERSIST-${randomUUID()}`;await host.getByLabel('私密输入').fill(secret);await host.getByRole('button',{name:'实际按钮'}).click();await expect.poll(async()=>{const p=await page.request.get(`/api/v1/sites/${site.id}/replay`);return (await p.json()).length;},{timeout:30000}).toBeGreaterThan(0);const replay=await page.request.get(`/api/v1/sites/${site.id}/replay`);expect(JSON.stringify(await replay.json())).not.toContain(secret);await expect.poll(async()=>{const p=await page.request.get(`/api/v1/sites/${site.id}/heatmap`);return (await p.json()).length;},{timeout:30000}).toBeGreaterThan(0);await page.goto('/app');await expect(page.getByRole('heading',{name:'总览',exact:true})).toBeVisible();await page.getByLabel('选择站点').selectOption(site.id);await navigateWorkspace(page, "回放");await expect(page.getByText('隐私结构回放：文本和输入已遮罩，图片及外链样式不会还原。')).toBeVisible();const frame=page.locator('iframe');await expect(frame).toHaveCount(1);expect(await frame.getAttribute('sandbox')).not.toContain('allow-scripts');await navigateWorkspace(page, "热图");await expect(page.getByRole('img',{name:'点击密度图'})).toBeVisible();await expect(page.locator('svg.heatmap circle')).toHaveCount(1);await openWorkspaceAccount(page);await page.getByLabel('界面语言 / Interface language').selectOption('en');await page.getByLabel('Select site').selectOption(site.id);await navigateWorkspace(page, "Replay");await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByLabel('Playback speed')).toBeVisible();await openWorkspaceAccount(page);await page.getByLabel('界面语言 / Interface language').selectOption('zh-CN');await context.close();});
