import{expect,it}from'vitest';
import{safeDateSelection,safePreviousDateSelection}from'../../src/web/dateValidation.js';
it('returns an explicit failure for a skipped civil date without a UTC query',()=>{
 expect(safeDateSelection('2011-12-30','2011-12-30','Pacific/Apia')).toEqual({ok:false,reason:'unrepresentable-range'});
});
it('rejects invalid and reversed inputs before building a range',()=>{
 for(const[from,to]of[['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['','2026-10-01']])expect(safeDateSelection(from!,to!,'UTC')).toEqual({ok:false,reason:'invalid-range'});
});
it('keeps the chosen site timezone and supports a valid DST civil day',()=>{
 const result=safeDateSelection('2026-03-08','2026-03-08','America/Los_Angeles');expect(result.ok).toBe(true);if(result.ok){const q=new URLSearchParams(result.query);expect(q.get('from')).toBe('2026-03-08T08:00:00.000Z');expect(q.get('to')).toBe('2026-03-09T07:00:00.000Z');}
});

it('preserves a valid current day when its previous civil period is unavailable',()=>{
 const current=safeDateSelection('2011-12-31','2011-12-31','Pacific/Apia');expect(current.ok).toBe(true);if(current.ok)expect(safePreviousDateSelection(current.query,'Pacific/Apia')).toEqual({ok:false,reason:'unrepresentable-range'});
});
