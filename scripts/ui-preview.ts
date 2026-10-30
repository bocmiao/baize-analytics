/** 截图验收脚本：lite 应用 + 合成真实数据 + Playwright 截图。用法：npx tsx .baize-preview/shoot.ts <outDir> */
import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {createLiteApp} from '../src/lite/app.js';
import {prepareInstallationFixture, fixtureInstallationNonce} from '../tests/helpers/install-fixture.js';

const outDir = process.argv[2] ?? '.baize-preview/shots';
const EMAIL = 'preview@example.test', PASSWORD = 'BaizePreview2026!';

const paths = ['/','/blog/self-host-analytics','/blog/baize-vs-plausible','/docs/quick-start','/docs/tracker-install','/pricing','/changelog','/about','/download'];
const referrers = [undefined,undefined,undefined,'https://www.google.com/','https://github.com/','https://v2ex.com/','https://linux.do/','https://www.bing.com/','https://x.com/','https://news.ycombinator.com/'];
const uas = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
];
const screens = ['1920x1080','2560x1440','390x844','412x915','1512x982'];
const langs = ['zh-CN','zh-CN','zh-CN','en-US','zh-TW','ja-JP'];
const pick = <T,>(list: T[], seed: number) => list[Math.floor(seed * list.length) % list.length];

type WireEvent = Record<string, unknown>;
function seedEnvelope(siteId: string, dayOffset: number): {events: WireEvent[]; ua: string} {
  const events: WireEvent[] = [];
  const dayStart = Date.now() - dayOffset * 86400000;
  const dow = new Date(dayStart).getDay();
  const weekend = dow === 0 || dow === 6;
  const growth = 1 + (14 - dayOffset) * 0.06;
  const sessions = Math.round((weekend ? 34 : 62) * growth);
  let ua = uas[0];
  for (let s = 0; s < sessions; s++) {
    const visitor = randomUUID();
    const rnd = (s * 7919 % 97) / 97;
    const uaNow = pick(uas, rnd * 3.7 + dayOffset);
    ua = uaNow;
    const hour = 8 + Math.floor(rnd * 15), minute = Math.floor(rnd * 60);
    const ts = dayStart + hour * 3600000 + minute * 60000;
    const ref = pick(referrers, rnd * 5.3 + s);
    const utm = ref && ref.includes('google') && rnd > .4 ? {utm_source:'google',utm_medium:'cpc',utm_campaign:'baize_launch'} : undefined;
    const pageCount = rnd < .55 ? 1 : rnd < .85 ? 2 : 4;
    for (let p = 0; p < pageCount; p++) {
      const path = pick(paths, rnd * 2.1 + p * 1.7 + s * .13);
      events.push({event_id: randomUUID(), type:'pageview', ts: ts + p * 90000, visitor_id: visitor, page_id: randomUUID(),
        url:'https://example.test' + path, path, referrer: ref, title:'白泽 · 网站分析',
        screen: pick(screens, rnd + p), language: pick(langs, rnd * 1.9 + p), ...utm});
      if (p === 0 && rnd > .5) events.push({event_id: randomUUID(), type:'heartbeat', ts: ts + 45000, visitor_id: visitor,
        page_id: events[events.length - 1]!.page_id, url:'https://example.test' + path, path, visible_ms: Math.round(rnd * 180000) + 8000,
        interval_start: ts, interval_end: ts + 60000});
    }
    if (rnd > .86) events.push({event_id: randomUUID(), type:'event', ts: ts + 120000, visitor_id: visitor, page_id: randomUUID(),
      url:'https://example.test/download', path:'/download', event_name:'download_click', props:{kind:'cli'}});
    if (rnd > .93) events.push({event_id: randomUUID(), type:'revenue', ts: ts + 150000, visitor_id: visitor, page_id: randomUUID(),
      url:'https://example.test/pricing', path:'/pricing', revenue: Math.round(rnd * 480) + 19, currency:'CNY', order_id:'ord-' + randomUUID().slice(0, 8)});
  }
  return {events, ua};
}

async function main() {
  const root = join(process.cwd(), '.baize-preview', 'runtime-' + Date.now());
  await mkdir(root, {recursive: true});
  const dataDir = join(root, 'data'), keyDir = join(root, 'keys');
  await prepareInstallationFixture(keyDir);
  const runtime = await createLiteApp({dataDir, keyDir, publicUrl: 'http://127.0.0.1'});
  const origin = await runtime.app.listen({host: '127.0.0.1', port: 0});
  console.log('lite app at', origin);
  try {
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(origin + path, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)});
    const setup = await post('/api/setup', {installationNonce: fixtureInstallationNonce, email: EMAIL, password: PASSWORD, name: '预览管理员'});
    if (setup.status !== 200) throw new Error('setup failed: ' + setup.status + await setup.text());
    const login = await post('/api/login', {email: EMAIL, password: PASSWORD});
    const cookie = (login.headers.getSetCookie?.()[0] ?? setup.headers.getSetCookie?.()[0])!.split(';')[0]!;
    if (login.status !== 200) console.warn('login status', login.status);
    const createdRes = await post('/api/v1/sites', {name: '白泽示例站', domain: 'example.test', timezone: 'Asia/Shanghai', privacy_mode: 'standard'}, {cookie});
    if (createdRes.status !== 201) throw new Error('site create failed: ' + createdRes.status + await createdRes.text());
    const created = await createdRes.json() as {site: {id: string}};
    const siteId = created.site.id;
    console.log('site', siteId);

    for (let day = 14; day >= 0; day--) {
      const {events} = seedEnvelope(siteId, day);
      for (let i = 0; i < events.length; i += 50) {
        const batch = events.slice(i, i + 50);
        const res = await post('/api/collect', {protocol_version: 1, site_id: siteId, sdk: 'preview-seed', sent_at: Date.now(), events: batch},
          {'user-agent': uas[0], cookie});
        if (res.status !== 202 && res.status !== 204) console.warn('collect', res.status, await res.text());
      }
    }
    console.log('seeded; waiting for aggregation…');
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const isoFrom = encodeURIComponent(`${from}T00:00:00+08:00`), isoTo = encodeURIComponent(`${to}T23:59:59+08:00`);
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const stats = await fetch(`${origin}/api/v1/sites/${siteId}/stats?from=${isoFrom}&to=${isoTo}`, {headers: {cookie}}).then(r => r.json());
      const coverage = (stats as {coverage?: number}).coverage;
      console.log('coverage', coverage);
      if (coverage === 1) break;
    }

    const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:\\Users\\10743\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe'});
    const app = (report: string, range = true) =>
      range ? `/app?site=${siteId}&report=${report}&from=${from}&to=${to}` : `/app?site=${siteId}&report=${report}`;
    const shots: {name: string; url: string; viewport: {width: number; height: number}; theme?: string; full?: boolean}[] = [
      {name: 'landing', url: '/', viewport: {width: 1440, height: 1000}},
      {name: 'login', url: '/login', viewport: {width: 1440, height: 1000}},
      {name: 'overview', url: app('overview'), viewport: {width: 1440, height: 1000}, full: true},
      {name: 'overview-dark', url: app('overview') + '&theme=dark', viewport: {width: 1440, height: 1000}, theme: 'dark', full: true},
      {name: 'pages', url: app('pages'), viewport: {width: 1440, height: 1000}, full: true},
      {name: 'sources', url: app('sources'), viewport: {width: 1440, height: 1000}},
      {name: 'audience', url: app('audience'), viewport: {width: 1440, height: 1000}, full: true},
      {name: 'events', url: app('events'), viewport: {width: 1440, height: 1000}},
      {name: 'settings', url: app('settings'), viewport: {width: 1440, height: 1000}},
      {name: 'realtime', url: app('realtime', false), viewport: {width: 1440, height: 1000}},
      {name: 'visits', url: app('visits'), viewport: {width: 1440, height: 1000}, full: true},
      {name: 'events2', url: app('events'), viewport: {width: 1440, height: 1000}, full: true},
      {name: 'landing-dark', url: '/', viewport: {width: 1440, height: 1000}, theme: 'dark'},
      {name: 'setup', url: '/setup', viewport: {width: 800, height: 1000}, full: true},
      {name: 'overview-mobile', url: `/app?site=${siteId}&report=overview&from=${to}&to=${to}`, viewport: {width: 390, height: 844}, full: true},
    ];
    await mkdir(outDir, {recursive: true});
    for (const shot of shots) {
      const context = await browser.newContext({viewport: shot.viewport, reducedMotion: 'reduce'});
      await context.addCookies([{name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: origin}]);
      if (shot.theme) await context.addInitScript(`localStorage.setItem('baize-theme','${shot.theme}')`);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + shot.url, {waitUntil: 'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await page.screenshot({path: join(outDir, shot.name + '.png'), fullPage: shot.full ?? false});
      if (errors.length) console.warn('pageerror on', shot.name, errors.slice(0, 3));
      await context.close();
    }
    await browser.close();
    console.log('screenshots saved to', outDir);
  } finally {
    await runtime.app.close();
    await rm(root, {recursive: true, force: true});
  }
}
void main();
