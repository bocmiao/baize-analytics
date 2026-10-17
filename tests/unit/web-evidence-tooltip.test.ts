import {afterEach,describe,expect,it,vi} from 'vitest';
import {formatEvidenceTooltip} from '../../src/web/evidenceTooltip';

afterEach(()=>vi.unstubAllGlobals());
describe('evidence tooltip scope',()=>{
 const points=[{label:'2026-10-16T10:00:00Z',value:10},{label:'2026-10-16T11:00:00Z',value:20}];
 it('labels the unfinished last bucket without requiring a previous period',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});
  expect(formatEvidenceTooltip([{dataIndex:1}],{points,metricLabel:'浏览量',openEnded:true})).toBe('2026-10-16T11:00:00Z · 未完结\n浏览量: 20');
  expect(formatEvidenceTooltip([{dataIndex:0}],{points,metricLabel:'浏览量',openEnded:true})).not.toContain('未完结');
 });
 it('keeps both actual period dates and suppresses unsafe incomplete comparisons',()=>{
  const comparison={name:'上期',points:[{label:'2026-10-15T10:00:00Z',value:5}]};
  expect(formatEvidenceTooltip([{dataIndex:0}],{points,metricLabel:'浏览量',comparison})).toContain('2026-10-15T10:00:00Z: 5 · +100.0%');
  expect(formatEvidenceTooltip([{dataIndex:0}],{points,metricLabel:'浏览量',comparison,openEnded:true})).not.toContain('%');
 });
 it('preserves unknowns and refuses zero/nonfinite baselines',()=>{
  for(const value of [0,null,Number.NaN])expect(formatEvidenceTooltip([{dataIndex:0}],{points:[{label:'current',value:null}],metricLabel:'浏览量',comparison:{name:'上期',points:[{label:'previous',value}]}})).not.toContain('%');
  expect(formatEvidenceTooltip([{dataIndex:0}],{points:[{label:'current',value:null}],metricLabel:'浏览量'})).toBe('current\n浏览量: —');
 });
 it('ignores empty, malformed and out-of-range chart callbacks',()=>{
  for(const items of [null,{},[],[null],[{}],[{dataIndex:-1}],[{dataIndex:2}],[{dataIndex:'0'}]])expect(formatEvidenceTooltip(items,{points,metricLabel:'浏览量'})).toBe('');
 });
 it('adds the site-timezone weekday without changing the locked label',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});
  expect(formatEvidenceTooltip([{dataIndex:1}],{points,metricLabel:'浏览量',openEnded:true,timezone:'UTC'})).toBe('2026-10-16T11:00:00Z · 周五 · 未完结\n浏览量: 20');
  expect(formatEvidenceTooltip([{dataIndex:0}],{points:[{label:'current',value:null}],metricLabel:'浏览量',timezone:'UTC'})).toBe('current\n浏览量: —');
 });
 it('still renders while storage is unavailable',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('SecurityError');}});
  expect(formatEvidenceTooltip([{dataIndex:1}],{points,metricLabel:'浏览量',openEnded:true})).toContain('未完结');
 });
});
