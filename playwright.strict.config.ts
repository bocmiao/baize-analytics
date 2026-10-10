import {defineConfig} from '@playwright/test';
if(process.env.E2E_STRICT_FACTS!=='1')throw Error('Strict browser acceptance requires E2E_STRICT_FACTS=1; it must not silently skip.');
if(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)throw Error('Strict browser acceptance requires actual PostgreSQL and ClickHouse URLs.');
export default defineConfig({testDir:'tests/e2e',testMatch:'strict-storage.spec.ts',workers:1,fullyParallel:false,use:{headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'},trace:'retain-on-failure'},reporter:'list'});
