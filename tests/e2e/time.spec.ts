import {test,expect} from '@playwright/test';
import {dateRange} from '../../src/web/time';
test('Chinese date picker uses the selected site timezone rather than browser UTC',()=>{const p=new URLSearchParams(dateRange('2026-10-10','2026-10-10','Asia/Shanghai'));expect(p.get('from')).toBe('2026-10-09T16:00:00.000Z');expect(p.get('to')).toBe('2026-10-10T15:59:59.999Z');});
test('date range includes the whole civil day across US daylight saving transition',()=>{const p=new URLSearchParams(dateRange('2026-03-08','2026-03-08','America/Los_Angeles'));expect(p.get('from')).toBe('2026-03-08T08:00:00.000Z');expect(p.get('to')).toBe('2026-03-09T06:59:59.999Z');});
