import {describe,expect,it} from 'vitest';
import {summarizePublishedHistory,type HistoryDay} from '../../src/server/51la-history-summary.js';

const days:HistoryDay[]=[
 {day:'2026-10-31',pv:10,uv:5,newVisitors:3,sessions:2,bounces:1,duration:100},
 {day:'2026-11-01',pv:30,uv:8,newVisitors:6,sessions:10,bounces:1,duration:200},
 {day:'2026-11-02',pv:30,uv:6,newVisitors:0,sessions:5,bounces:2,duration:200}
];
describe('51LA published historical summary',()=>{
 it('uses exact all-history IP membership instead of adding per-day distincts',()=>{
  const result=summarizePublishedHistory(days.map((day,index)=>({...day,ips:[2,4,3][index]})),{uv:11,newVisitors:9,ips:5});expect(result.totals.ips).toBe(5);expect(result.peaks.ips).toEqual({value:4,date:'2026-11-01'});
 });
 it('uses whole-history exact membership rather than adding daily UV',()=>{
  const summary=summarizePublishedHistory(days,{uv:11,newVisitors:9});expect(summary.totals).toMatchObject({pv:70,uv:11,newVisitors:9,ips:null,sessions:17});expect(summary.totals.uv).not.toBe(19);
 });
 it('weights bounce rate and duration by actual session counts',()=>{
  const summary=summarizePublishedHistory(days,{uv:11,newVisitors:9});expect(summary.totals.bounceRate).toBeCloseTo(4/17);expect(summary.totals.averageDuration).toBeCloseTo(500/17);expect(summary.totals.averagePages).toBeCloseTo(70/17);
 });
 it('records a separate local date for each metric, choosing the most recent tied peak',()=>{
  const {peaks}=summarizePublishedHistory(days,{uv:11,newVisitors:9});expect(peaks.pv).toEqual({value:30,date:'2026-11-02'});expect(peaks.uv).toEqual({value:8,date:'2026-11-01'});expect(peaks.bounceRate).toEqual({value:.5,date:'2026-10-31'});expect(peaks.averageDuration).toEqual({value:50,date:'2026-10-31'});expect(peaks.ips).toEqual({value:null,date:null});
 });
 it('marks incomplete legacy/filtered history unavailable instead of adding the surviving subset',()=>{
  const {totals,peaks}=summarizePublishedHistory(days,{uv:11,newVisitors:9},'filtered_legacy_history_unavailable');expect(Object.values(totals).every(value=>value===null)).toBe(true);expect(peaks).toMatchObject({pv:{value:null,date:null},uv:{value:null,date:null},coverage:0,status:'filtered_legacy_history_unavailable'});
 });
 it('does not expose a duplicated numeric sum when legacy hours overlap published effect facts',()=>{
  const duplicate=[days[0]!,days[0]!];const {totals,peaks}=summarizePublishedHistory(duplicate,{uv:5,newVisitors:3},'overlapping_legacy_history');expect(totals.pv).toBeNull();expect(totals.sessions).toBeNull();expect(peaks).toMatchObject({coverage:0,status:'overlapping_legacy_history',pv:{value:null,date:null}});
 });
 it('allows per-day UV peaks but never invents global UV in daily-salt mode',()=>{
  const {totals,peaks}=summarizePublishedHistory(days.map(day=>({...day,newVisitors:null})),{uv:null,newVisitors:null});expect(totals.uv).toBeNull();expect(totals.newVisitors).toBeNull();expect(peaks.uv.value).toBe(8);expect(peaks.newVisitors).toEqual({value:null,date:null});
 });
 it('represents empty history as zero totals without a fictional peak date',()=>{
  const {totals,peaks}=summarizePublishedHistory([],{uv:0,newVisitors:0});expect(totals).toMatchObject({pv:0,uv:0,sessions:0});expect(peaks).toMatchObject({pv:{value:null,date:null},status:'empty'});
 });
});
