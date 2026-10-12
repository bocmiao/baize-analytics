import {expect,it} from 'vitest';
import {civilDate,dateRange,inclusiveEnd,midnight,previousDateRange} from '../../src/web/time.js';
it('a missing Sao Paulo midnight starts at the first valid local instant, excluding the preceding day',()=>{
 const zone='America/Sao_Paulo',day='2018-11-04',start=midnight(day,zone);
 expect(new Date(start).toISOString()).toBe('2018-11-04T03:00:00.000Z');
 expect(civilDate(new Date(start-1).toISOString(),zone)).toBe('2018-11-03');
 expect(civilDate(new Date(start).toISOString(),zone)).toBe(day);
 const range=new URLSearchParams(dateRange(day,day,zone));expect(range.get('from')).toBe(new Date(start).toISOString());expect(range.get('to')).toBe('2018-11-05T02:00:00.000Z');expect((Date.parse(range.get('to')!)-start)/3600000).toBe(23);
 expect(inclusiveEnd(range.get('to')!,zone)).toBe(day);
});
it('previous period preserves the selected day across the missing-midnight transition and retains filters',()=>{
 const zone='America/Sao_Paulo',query=dateRange('2018-11-04','2018-11-04',zone)+'&path=%2Fdocs';
 const prior=new URLSearchParams(previousDateRange(query,zone));expect(prior.get('from')).toBe('2018-11-03T03:00:00.000Z');expect(prior.get('to')).toBe('2018-11-04T03:00:00.000Z');expect(prior.get('path')).toBe('/docs');
 const next=new URLSearchParams(previousDateRange(dateRange('2018-11-05','2018-11-05',zone),zone));expect(next.get('from')).toBe('2018-11-04T03:00:00.000Z');expect(next.get('to')).toBe('2018-11-05T02:00:00.000Z');
});
it.each([['2026-03-08','America/New_York',23],['2026-11-01','America/New_York',25],['2026-10-10','Asia/Shanghai',24]] as const)('retains ordinary and non-midnight DST civil-day boundaries %s', (day,zone,hours)=>{
 const range=new URLSearchParams(dateRange(day,day,zone));expect(civilDate(range.get('from')!,zone)).toBe(day);expect((Date.parse(range.get('to')!)-Date.parse(range.get('from')!))/3600000).toBe(hours);
});
it('a skipped Apia civil day rejects instead of silently selecting a different date',()=>{
 expect(()=>midnight('2011-12-30','Pacific/Apia')).toThrow('Civil date is not representable');
 expect(()=>dateRange('2011-12-30','2011-12-30','Pacific/Apia')).toThrow(RangeError);
});
it.each([['2018-10-26','2018-10-25'],['2011-10-28','2011-10-27']])('a repeated Amman midnight %s selects the earlier occurrence and keeps the whole 25-hour day',(day,prior)=>{
 const zone='Asia/Amman',start=midnight(day,zone);
 expect(new Date(start).toISOString()).toBe(`${prior}T21:00:00.000Z`);
 expect(civilDate(new Date(start-1).toISOString(),zone)).toBe(prior);
 const range=new URLSearchParams(dateRange(day,day,zone));expect(range.get('from')).toBe(new Date(start).toISOString());expect(range.get('to')).toBe(`${day}T22:00:00.000Z`);expect((Date.parse(range.get('to')!)-start)/3600000).toBe(25);
});
it('a valid Apia day before the omitted date ends at the next representable boundary',()=>{
 const zone='Pacific/Apia',range=new URLSearchParams(dateRange('2011-12-29','2011-12-29',zone));
 expect(range.get('from')).toBe('2011-12-29T10:00:00.000Z');expect(range.get('to')).toBe('2011-12-30T10:00:00.000Z');expect((Date.parse(range.get('to')!)-Date.parse(range.get('from')!))/3600000).toBe(24);expect(inclusiveEnd(range.get('to')!,zone)).toBe('2011-12-29');
 const prior=new URLSearchParams(previousDateRange(range.toString(),zone));expect(prior.get('from')).toBe('2011-12-28T10:00:00.000Z');expect(prior.get('to')).toBe('2011-12-29T10:00:00.000Z');
});
it('the valid following Apia day stays distinct while its nonexistent previous calendar period rejects',()=>{
 const zone='Pacific/Apia',following=new URLSearchParams(dateRange('2011-12-31','2011-12-31',zone));
 expect(following.get('from')).toBe('2011-12-30T10:00:00.000Z');expect(following.get('to')).toBe('2011-12-31T10:00:00.000Z');expect(civilDate(following.get('from')!,zone)).toBe('2011-12-31');expect(inclusiveEnd(following.get('to')!,zone)).toBe('2011-12-31');
 expect(()=>previousDateRange(following.toString(),zone)).toThrow('Civil date is not representable');
 expect(()=>dateRange('2011-12-29','2011-12-30',zone)).toThrow('Civil date is not representable');
});
