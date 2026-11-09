import {describe,expect,it} from 'vitest';
import {dailyReportQuery,previousDayChange} from '../../src/web/trafficModel';
import {previousDateRange} from '../../src/web/time';

describe('daily report calendar and comparisons',()=>{
 it('reduces a multi-day bookmark to its final site-calendar day while preserving filters',()=>{
  const selected=new URLSearchParams(dailyReportQuery('from=2026-10-26T16%3A00%3A00.000Z&to=2026-11-09T16%3A00%3A00.000Z&path=%2Fdocs&channel=search','Asia/Shanghai'));
  expect(selected.get('from')).toBe('2026-11-08T16:00:00.000Z');
  expect(selected.get('to')).toBe('2026-11-09T16:00:00.000Z');
  expect(selected.get('path')).toBe('/docs');expect(selected.get('channel')).toBe('search');
  const previous=new URLSearchParams(previousDateRange(selected.toString(),'Asia/Shanghai'));
  expect(previous.get('from')).toBe('2026-11-07T16:00:00.000Z');expect(previous.get('to')).toBe('2026-11-08T16:00:00.000Z');expect(previous.get('path')).toBe('/docs');
 });
 it('uses a 23-hour DST day and its actual preceding calendar day',()=>{
  const query=dailyReportQuery('from=2026-03-01T05%3A00%3A00.000Z&to=2026-03-09T04%3A00%3A00.000Z','America/New_York');
  const selected=new URLSearchParams(query);expect(selected.get('from')).toBe('2026-03-08T05:00:00.000Z');expect(selected.get('to')).toBe('2026-03-09T04:00:00.000Z');
  const previous=new URLSearchParams(previousDateRange(query,'America/New_York'));expect(previous.get('from')).toBe('2026-03-07T05:00:00.000Z');expect(previous.get('to')).toBe('2026-03-08T05:00:00.000Z');
 });
 it('does not invent a percentage from zero or missing previous values',()=>{
  expect(previousDayChange(10,0)).toBeNull();expect(previousDayChange(0,0)).toBeNull();expect(previousDayChange(10,null)).toBeNull();expect(previousDayChange(null,5)).toBeNull();expect(previousDayChange(Infinity,5)).toBeNull();
  expect(previousDayChange(0,20)).toBe(-1);expect(previousDayChange(30,20)).toBe(.5);expect(previousDayChange(20,20)).toBe(0);
 });
});
