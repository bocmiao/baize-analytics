import {chmod} from 'node:fs/promises';
import { chromium, expect, type FullConfig } from '@playwright/test';

/** Real wizard runs before every file; persisted owner cookies are never repository artifacts. */
export default async function globalSetup(config: FullConfig) {
    const project = config.projects[0]!;
    const browser = await chromium.launch({ headless: true, ...project.use.launchOptions });
    const context = await browser.newContext({ baseURL: project.use.baseURL });
    const page = await context.newPage();
    try {
        const setup = await context.request.get('/api/setup');
        expect(setup.ok()).toBeTruthy();
        if ((await setup.json()).required) {
            await page.goto('/setup');
            await page.getByLabel('安装凭证', { exact: true }).fill('42'.repeat(32));
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
        } else {
            await page.goto('/login');
            await page.getByLabel('邮箱', { exact: true }).fill('acceptance@example.test');
            await page.getByLabel('密码', { exact: true }).fill('BaizeAcceptance2026!');
            await page.getByRole('button', { name: '登录', exact: true }).click();
        }
        await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible();
        await context.storageState({ path: project.use.storageState as string });
        await chmod(project.use.storageState as string, 0o600);
    } finally { await browser.close(); }
}
