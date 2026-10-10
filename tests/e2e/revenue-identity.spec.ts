import {navigateWorkspace} from './navigation';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function trackerHost(browser: Browser, baseURL: string, siteId: string, path: string) {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const host = await context.newPage();
    await host.route(`${baseURL}${path}*`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><title>真实收入与身份验收</title></head><body><h1>业务宿主页面</h1><script async src="${baseURL}/tracker.js" data-site-id="${siteId}" data-api-host="${baseURL}" data-consent-required="true"></script></body></html>` }));
    await host.goto(`${baseURL}${path}?utm_source=acceptance&utm_medium=email`);
    await host.waitForFunction(() => Boolean((window as unknown as { baize: unknown }).baize));
    await host.evaluate(async () => { const tracker = (window as unknown as { baize: { ready: Promise<void>; grantConsent: () => void; flush: () => Promise<void> } }).baize; await tracker.ready; tracker.grantConsent(); await tracker.flush(); });
    return { context, host };
}
async function site(page: Page, baseURL: string, name: string, extra: object = {}) {
    const response = await page.request.post('/api/v1/sites', { data: { name, domain: new URL(baseURL).hostname, timezone: 'Asia/Shanghai', privacy_mode: 'standard', tags: [], config: { consent_required: true }, ...extra } });
    expect(response.ok()).toBeTruthy(); return (await response.json()).site;
}
test('actual tracker revenue keeps currencies separate and event-time account switches isolated', async ({ page, browser, baseURL }) => {
    test.setTimeout(60000);
    const current = await site(page, baseURL!, `收入身份专项 ${Date.now()}`);
    const { context, host } = await trackerHost(browser, baseURL!, current.id, '/income-identity-acceptance');
    const accountA = `PRIVATE-BUSINESS-A-${randomUUID()}`, accountB = `PRIVATE-BUSINESS-B-${randomUUID()}`;
    try {
        await host.evaluate(async id => { const tracker = (window as unknown as { baize: { identify: (id: string) => void; track: (name: string) => void; flush: () => Promise<void> } }).baize; tracker.identify(id); tracker.track('signup'); await tracker.flush(); }, accountA);
        await host.evaluate(async () => { const tracker = (window as unknown as { baize: { trackRevenue: (value: number, options: { currency: string; order_id: string }) => void; flush: () => Promise<void> } }).baize; tracker.trackRevenue(99, { currency: 'CNY', order_id: 'order-cny-a' }); tracker.trackRevenue(5, { currency: 'USD', order_id: 'order-usd-a' }); tracker.trackRevenue(99, { currency: 'CNY', order_id: 'order-cny-a' }); await tracker.flush(); });
        await host.evaluate(async id => { const tracker = (window as unknown as { baize: { identify: (id: string) => void; flush: () => Promise<void> } }).baize; tracker.identify(id); await tracker.flush(); }, accountB);
        await host.evaluate(async () => { const tracker = (window as unknown as { baize: { trackRevenue: (value: number, options: { currency: string; order_id: string }) => void; flush: () => Promise<void> } }).baize; tracker.trackRevenue(20, { currency: 'CNY', order_id: 'order-cny-b' }); await tracker.flush(); });
        await expect.poll(async () => { const response = await page.request.get(`/api/v1/sites/${current.id}/revenue`); const result = await response.json(); return result.coverage === 1 && result.revenueByCurrency?.CNY === 119 && result.revenueByCurrency?.USD === 5; }, { timeout: 30000 }).toBe(true);
        const response = await page.request.get(`/api/v1/sites/${current.id}/identities`); expect(response.ok()).toBeTruthy(); const identities = await response.json();
        expect(JSON.stringify(identities)).not.toContain(accountA); expect(JSON.stringify(identities)).not.toContain(accountB);
        expect(identities.identities).toHaveLength(2); expect(identities.signupCount).toBe(1); expect(identities.paidAfterSignup).toBe(1); expect(identities.conversionRate).toBe(1);
        const a = identities.identities.find((row: { revenueByCurrency: { USD?: number } }) => row.revenueByCurrency.USD === 5); const b = identities.identities.find((row: { revenueByCurrency: { CNY?: number } }) => row.revenueByCurrency.CNY === 20);
        expect(a.revenueByCurrency.CNY).toBe(99); expect(b.revenueByCurrency.USD).toBeUndefined();
        await page.goto('/app'); await page.getByLabel('选择站点').selectOption(current.id); await navigateWorkspace(page, "收入归因");
        const income = page.getByRole('heading', { name: '收入归因与订单趋势', exact: true }).locator('..');
        await expect(income.getByRole('cell', { name: '119', exact: true }).first()).toBeVisible(); await page.getByLabel('选择收入币种').selectOption('USD'); await expect(income.getByRole('heading', { name: '末次非直接点击归因' }).locator('..').getByRole('cell', { name: 'email', exact: true })).toBeVisible();
        await navigateWorkspace(page, "已识别用户"); await expect(page.getByRole('heading', { name: '账号时间绑定内的活动' })).toBeVisible();
        await page.getByLabel('选择已识别账号').selectOption(b.userKey); const activities = page.getByRole('heading', { name: '账号时间绑定内的活动' }).locator('..'); await expect(activities.getByRole('cell', { name: '20', exact: true })).toBeVisible(); await expect(activities.getByRole('cell', { name: 'USD', exact: true })).toHaveCount(0);
        expect(await page.locator('body').innerText()).not.toContain(accountA); expect(await page.locator('body').innerText()).not.toContain(accountB);
        await page.getByLabel('界面语言 / Interface language').selectOption('en'); await page.getByLabel('Select site').selectOption(current.id); await navigateWorkspace(page, "Identified users"); await expect(page.getByRole('heading', { name: 'Activity within account bindings' })).toBeVisible(); await expect(page.getByLabel('Registration event name')).toBeVisible();
        await navigateWorkspace(page, "Revenue attribution"); await expect(page.getByLabel('Select revenue currency')).toBeVisible(); await page.getByLabel('界面语言 / Interface language').selectOption('zh-CN');
        const daily = await site(page, baseURL!, `每日盐身份边界 ${Date.now()}`, { privacy_mode: 'daily_salt' }); await page.getByRole('button', { name: '刷新', exact: true }).click(); await page.getByLabel('选择站点').selectOption(daily.id); await navigateWorkspace(page, "已识别用户"); await expect(page.getByText('每日盐模式不支持身份缝合，不列出业务账号。')).toBeVisible(); await expect(page.getByLabel('选择已识别账号')).toHaveCount(0);
    } finally { await context.close(); }
});

test('actual consented experiment assignment and tracker conversion survive stop and resume', async ({ page, browser, baseURL }) => {
    test.setTimeout(60000);
    const current = await site(page, baseURL!, `实验专项 ${Date.now()}`, { config: { consent_required: true, experiments: true } });
    await page.goto('/app'); await page.getByLabel('选择站点').selectOption(current.id); await navigateWorkspace(page, "实验");
    const name = `真实固定周期实验 ${Date.now()}`;
    await page.getByLabel('实验名称').fill(name); await page.getByLabel('变体名称（每行一个，至少两个）').fill('control\nvariant-b'); await page.getByLabel('真实转化事件名称').fill('actual-purchase');
    const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/sites/${current.id}/experiments`));
    await page.getByRole('button', { name: '创建实验', exact: true }).click(); const experimentResponse = await created; expect(experimentResponse.ok()).toBeTruthy(); const experiment = await experimentResponse.json();
    const { context, host } = await trackerHost(browser, baseURL!, current.id, '/experiment-acceptance');
    try {
        const visitor = await host.evaluate(() => document.cookie.split('; ').find(value => value.startsWith('_baize_uid='))!.split('=')[1]!);
        const denied = await host.request.post(`/api/v1/experiments/${experiment.id}/assign`, { data: { site_id: current.id, visitor_id: visitor, consent: false } }); expect(denied.status()).toBe(400);
        const assign = () => host.request.post(`/api/v1/experiments/${experiment.id}/assign`, { data: { site_id: current.id, visitor_id: visitor, consent: true } });
        const assignment = await assign(); expect(assignment.ok()).toBeTruthy(); const { variant } = await assignment.json(); const repeated = await assign(); expect((await repeated.json()).variant).toBe(variant);
        await host.evaluate(async () => { const tracker = (window as unknown as { baize: { track: (event: string) => void; flush: () => Promise<void> } }).baize; tracker.track('actual-purchase'); tracker.track('actual-purchase'); await tracker.flush(); });
        await expect.poll(async () => { const response = await page.request.get(`/api/v1/sites/${current.id}/experiments`); return (await response.json()).find((row: { variant: string }) => row.variant === variant)?.conversions; }, { timeout: 30000 }).toBe(1);
        await page.getByRole('button', { name: '刷新', exact: true }).click(); const result = page.getByRole('heading', { name, exact: true }).locator('..');
        await expect(result.getByRole('cell', { name: '1', exact: true })).toHaveCount(2); await expect(result.getByRole('cell', { name: '样本不足', exact: true })).toBeVisible();
        await result.getByRole('button', { name: '停止新访客分配' }).click(); await expect(result.getByText('实验状态：已停止分配')).toBeVisible(); expect((await assign()).status()).toBe(404);
        const stopped = await page.request.get(`/api/v1/sites/${current.id}/experiments`); expect((await stopped.json()).find((row: { variant: string }) => row.variant === variant).conversions).toBe(1);
        await result.getByRole('button', { name: '继续访客分配' }).click(); await expect(result.getByText('实验状态：采集中')).toBeVisible(); expect((await (await assign()).json()).variant).toBe(variant);
        await page.getByLabel('界面语言 / Interface language').selectOption('en'); await page.getByLabel('Select site').selectOption(current.id); await navigateWorkspace(page, "Experiments");
        await expect(page.getByRole('columnheader', { name: '95% conversion-rate interval' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Stop new visitor assignments' })).toBeVisible(); await page.getByLabel('界面语言 / Interface language').selectOption('zh-CN');
    } finally { await context.close(); }
});
