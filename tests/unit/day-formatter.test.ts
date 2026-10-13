import {describe,it,expect,vi} from 'vitest';
import {dayOf} from '../../src/server/analytics-core.js';
const options=(zone:string)=>({timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'} as const);
const oracle=(ts:Date|string,zone:string)=>{const parts=new Intl.DateTimeFormat('en-CA',options(zone)).formatToParts(new Date(ts));return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');};
describe('bounded local-day formatter reuse',()=>{
 it('preserves DST, midnight, month/year boundaries and historic dates against Intl oracle',()=>{
  const zones=['UTC','Asia/Shanghai','America/New_York','Asia/Kathmandu'];
  const times=['1969-12-31T23:59:59Z','1970-01-01T00:00:00Z','2026-03-08T06:59:59Z','2026-03-08T07:00:00Z','2026-11-01T05:59:59Z','2026-11-01T06:00:00Z','2026-10-01T15:59:59Z','2026-10-01T16:00:00Z','2026-12-31T23:59:59Z','2027-01-01T00:00:00Z'];
  for(const zone of zones)for(const at of times){expect(dayOf(at,zone)).toBe(oracle(at,zone));expect(dayOf(new Date(at),zone)).toBe(oracle(at,zone));}
  expect(dayOf('2026-10-01T15:59:59Z','Asia/Shanghai')).toBe('2026-10-01');expect(dayOf('2026-10-01T16:00:00Z','Asia/Shanghai')).toBe('2026-10-02');
 });
 it('keeps only 32 formatter entries and reconstructs an evicted timezone without retaining date results',()=>{
  const Native=Intl.DateTimeFormat,constructed:string[]=[];
  const spy=vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(locales,opts){constructed.push(String(opts?.timeZone));return new Native(locales,opts);});
  try{
   // First visit >32 distinct valid zones, then revisit the earliest.
   const zones=Intl.supportedValuesOf('timeZone').slice(0,40),at='2026-01-31T23:59:59Z';
   for(const zone of zones)expect(dayOf(at,zone)).toBe(oracle(at,zone));
   const before=constructed.length;dayOf('2026-02-01T00:00:00Z',zones[0]!);expect(constructed.length).toBe(before+1);
   const cached=constructed.length;dayOf('2027-01-01T00:00:00Z',zones[0]!);expect(constructed.length).toBe(cached);
  }finally{spy.mockRestore();}
 });
 it('continues throwing RangeError for invalid timezone and invalid date',()=>{expect(()=>dayOf('2026-01-01','invalid/timezone')).toThrow(RangeError);expect(()=>dayOf('invalid','UTC')).toThrow(RangeError);});
});
