import {navigateWorkspace,openWorkspaceAccount,revealDateInputs} from './navigation';
import { expect, test } from '@playwright/test';
const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const mobile = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const date = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
test('actual tracker funnel loss uses typed properties and honest time, retention and privacy boundaries', async ({ page, browser, baseURL }) => {
    test.setTimeout(90000);
    const created = await page.request.post('/api/v1/sites', { data: { name: `漏斗流失专项 ${Date.now()}`, domain: new URL(baseURL!).hostname, timezone: 'UTC', privacy_mode: 'standard', tags: [], config: { consent_required: true } } }); expect(created.ok()).toBeTruthy(); const site = (await created.json()).site;
    const definition = { name: '真实属性流失漏斗', steps: [{ type: 'event', value: 'view-plan' }, { type: 'event', value: 'paid-plan' }], strict: true };
    const f = await page.request.post(`/api/v1/sites/${site.id}/funnels`, { data: definition }); expect(f.ok()).toBeTruthy(); const funnel = await f.json();
    for (const [index, property] of [true, 'true', 2, null].entries()) {
        const context = await browser.newContext({ userAgent: index === 3 ? mobile : desktop, viewport: { width: index === 3 ? 400 : 1280, height: 800 }, screen: { width: index === 3 ? 400 : 1280, height: 800 } });
        try {
            await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); const host = await context.newPage();
            await host.route(`${baseURL}/funnel-acceptance*`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><h1>真实漏斗宿主</h1><script async src="${baseURL}/tracker.js" data-site-id="${site.id}" data-api-host="${baseURL}" data-consent-required="true"></script></body></html>` }));
            await host.goto(`${baseURL}/funnel-acceptance?utm_medium=email`); await host.waitForFunction(() => Boolean((window as unknown as { baize: unknown }).baize));
            await host.evaluate(async () => {const tracker=(window as unknown as {baize:{ready:Promise<void>;grantConsent:()=>void;flush:()=>Promise<void>}}).baize;await tracker.ready;tracker.grantConsent();await tracker.flush();});
            await host.evaluate(async property => { const tracker = (window as unknown as { baize: { track: (name: string, props?: Record<string, string | number | boolean>) => void; flush: () => Promise<void> } }).baize; tracker.track('view-plan', property === null ? {} : { plan: property }); await tracker.flush(); }, property);
            if(index===2)await host.evaluate(async()=>{const tracker=(window as unknown as {baize:{track:(name:string)=>void;flush:()=>Promise<void>}}).baize;tracker.track('paid-plan');await tracker.flush();});
        } finally { await context.close(); }
    }
    await page.goto('/app'); await page.getByLabel('选择站点').selectOption(site.id); await navigateWorkspace(page, "漏斗");
    const panel = page.getByRole('heading', { name: '漏斗流失访客特征', exact: true }).locator('..');
    await expect(panel.getByText(/步骤 1.*进入 4.*流失 3/)).toBeVisible({ timeout: 30000 });
    await expect(panel.getByText('今日未来时段已截到当前时间，不生成未来零值。')).toBeVisible();
    await page.getByLabel('安全事件属性（可选）').fill('plan'); await page.getByRole('button', { name: '分析流失属性', exact: true }).click();
    const firstStep = panel.locator('.funnel-dropoff-step').first();
    await expect(firstStep.getByText('有属性样本：2 · 缺失属性样本：1')).toBeVisible(); await expect(firstStep.getByRole('cell', { name: 'boolean', exact: true })).toBeVisible(); await expect(firstStep.getByRole('cell', { name: 'string', exact: true })).toBeVisible(); await expect(firstStep.getByRole('cell', { name: 'true', exact: true })).toHaveCount(2);
    await expect(firstStep.getByRole('cell', { name: 'email', exact: true })).toBeVisible(); await expect(firstStep.getByRole('cell', { name: 'mobile', exact: true })).toBeVisible();
    const actual = await page.request.get(`/api/v1/sites/${site.id}/funnels/${funnel.id}/analysis?from=${date()}T00:00:00.000Z&to=${new Date().toISOString()}&property=plan`); expect(actual.ok()).toBeTruthy(); const result = await actual.json(); expect(result.steps[0].properties).toEqual(expect.arrayContaining([{ type: 'boolean', value: 'true', count: 1 }, { type: 'string', value: 'true', count: 1 }])); expect(result.coverage).toBe(1); expect(result.truncated).toBe(false);
    await openWorkspaceAccount(page);await page.getByLabel('界面语言 / Interface language').selectOption('en'); await page.getByLabel('Select site').selectOption(site.id); await navigateWorkspace(page, "Funnels"); await expect(page.getByLabel('Safe event property (optional)')).toBeVisible(); await expect(page.getByText('The future part of today is clamped to now; future zero values are not generated.')).toBeVisible(); await openWorkspaceAccount(page);await page.getByLabel('界面语言 / Interface language').selectOption('zh-CN'); await page.getByLabel('选择站点').selectOption(site.id); await navigateWorkspace(page, "漏斗");
    await (await revealDateInputs(page), page).getByLabel('开始', { exact: true }).fill(date(1)); await (await revealDateInputs(page), page).getByLabel('结束', { exact: true }).fill(date(1)); await expect(panel.getByText(/状态：所选时间尚未发生.*覆盖率：0%/)).toBeVisible(); await expect(panel.locator('.funnel-dropoff-step')).toHaveCount(0);
    expect((await page.request.patch(`/api/v1/sites/${site.id}/retention`, { data: { days: 1 } })).ok()).toBeTruthy(); await (await revealDateInputs(page), page).getByLabel('开始', { exact: true }).fill(date(-2)); await (await revealDateInputs(page), page).getByLabel('结束', { exact: true }).fill(date()); await expect(panel.getByText(/状态：超出明细保留期.*覆盖率：0%/)).toBeVisible(); await expect(panel.locator('.funnel-dropoff-step')).toHaveCount(0);
    const dailyCreated = await page.request.post('/api/v1/sites', { data: { name: `每日盐流失边界 ${Date.now()}`, domain: 'daily-funnel.example.test', timezone: 'UTC', privacy_mode: 'daily_salt', tags: [] } }); expect(dailyCreated.ok()).toBeTruthy(); const daily = (await dailyCreated.json()).site; expect((await page.request.post(`/api/v1/sites/${daily.id}/funnels`, { data: definition })).ok()).toBeTruthy(); await (await revealDateInputs(page), page).getByRole('button',{name:'刷新',exact:true}).click(); await page.getByLabel('选择站点').selectOption(daily.id); await expect(panel.getByText(/状态：每日盐模式不支持跨日漏斗.*覆盖率：0%/)).toBeVisible(); await expect(panel.locator('.funnel-dropoff-step')).toHaveCount(0);
});
