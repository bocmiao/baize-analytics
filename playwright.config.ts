import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',fullyParallel:false,workers:1,use:{baseURL:process.env.E2E_BASE_URL||'http://127.0.0.1:3000',headless:true,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:undefined,trace:'retain-on-failure'},reporter:'list'});
