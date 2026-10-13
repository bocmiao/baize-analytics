import {createHash} from 'node:crypto';
import {defineConfig} from '@playwright/test';
const profile=process.env.E2E_PROFILE??'standard';
if(!['standard','lite'].includes(profile))throw Error('E2E_PROFILE must be standard or lite');
const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:3000';
// Separate live test deployments must not overwrite each other's owner cookie.
const ownerScope=JSON.stringify([process.cwd(),profile,baseURL]);
export default defineConfig({testDir:'tests/e2e',testMatch:profile==='lite'?['**/lite-profile.spec.ts','**/lite-optional-profile.spec.ts']:undefined,testIgnore:profile==='standard'?['**/lite-profile.spec.ts','**/lite-optional-profile.spec.ts']:undefined,globalSetup:'./tests/e2e/global-setup.ts',fullyParallel:false,workers:1,use:{storageState:`/tmp/baize-e2e-owner-${createHash('sha256').update(ownerScope).digest('hex').slice(0,16)}.json`,baseURL,headless:true,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:undefined,trace:'retain-on-failure'},reporter:'list'});
