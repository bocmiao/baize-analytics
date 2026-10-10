import {expect,it} from 'vitest';
import {locateTrendAnnotations} from '../../src/web/annotationTrend';
import type {SiteAnnotation} from '../../packages/contracts/operations-observations';
const note=(date:string,timezone='Asia/Shanghai',id=date):SiteAnnotation=>({id,date,timezone,title:'<img src=x onerror=alert(1)>',note:'User text remains text'});
it('locates saved site-calendar notes only on actual finite observed bins without manufacturing points',()=>{
 const points=[{label:'2026-10-10T15:00:00Z',value:null},{label:'2026-10-10T16:00:00Z',value:0},{label:'2026-10-10T17:00:00Z',value:5}];const original=structuredClone(points);const result=locateTrendAnnotations([note('2026-10-11'),note('2026-10-10'),note('2026-10-12'),note('2026-10-11','UTC','mismatch')],points,'Asia/Shanghai');expect(result).toHaveLength(1);expect(result[0]).toMatchObject({date:'2026-10-11',index:1,label:'2026-10-10T16:00:00Z',title:'<img src=x onerror=alert(1)>'});expect(points).toEqual(original);expect(locateTrendAnnotations([note('2026-10-11')],[],'Asia/Shanghai')).toEqual([]);
});
it('does not guess dates from malformed labels or missing metrics and preserves the server 200-row cap',()=>{
 const points=[{label:'invalid',value:3},{label:'2026-02-30',value:3},{label:'2026-10-11',value:Number.NaN},{label:'2026-10-12',value:2}];expect(locateTrendAnnotations([note('2026-02-30'),note('2026-10-11')],points,'Asia/Shanghai')).toEqual([]);expect(locateTrendAnnotations(Array.from({length:201},(_,index)=>note('2026-10-12','Asia/Shanghai',String(index))),points,'Asia/Shanghai')).toHaveLength(200);
});
