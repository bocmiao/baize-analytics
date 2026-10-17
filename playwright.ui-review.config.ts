import {defineConfig} from '@playwright/test';

/** Each review spec owns disposable auth/site/database fixtures; no live app/global owner cookie. */
export default defineConfig({
 testDir:'tests/e2e',
 testMatch:['pr3-ui-regressions.spec.ts','pr2-jade-ui.spec.ts','approved-ui.spec.ts','overview-redesign.spec.ts','overview-layout.spec.ts','seo-gsc-evidence.spec.ts'],
 workers:1,
 use:{headless:true,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:undefined,trace:'off'},
 reporter:'list',
});
