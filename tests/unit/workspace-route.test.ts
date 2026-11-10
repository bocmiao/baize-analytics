import {describe,expect,it} from 'vitest';
import {cleanFilters,navigationGroups,readWorkspaceRoute,validCivilDate,workspaceReports,workspaceUrl} from '../../src/web/workspaceRoute.js';
import {workspacePageChanged} from '../../src/web/useWorkspaceRoute';
describe('workspace navigation URL contract',()=>{
 it('resets scroll for report/site transitions while keeping date and filter edits in place',()=>{
  const route=readWorkspaceRoute('?site=demo&report=sources&from=2026-11-01&to=2026-11-10');
  expect(workspacePageChanged(route,{...route,report:'pages'})).toBe(true);
  expect(workspacePageChanged(route,{...route,siteId:'next'})).toBe(true);
  expect(workspacePageChanged(route,readWorkspaceRoute('?site=demo&report=sources&from=2026-11-09&to=2026-11-10&path=%2Fpricing'))).toBe(false);
 });
 it('keeps the daily report on the selected last day when opened from a multi-day report',()=>{
  const route=readWorkspaceRoute('?site=demo&report=daily&from=2026-10-27&to=2026-11-09&path=%2Fdocs');
  expect(route).toEqual({siteId:'demo',report:'daily',from:'2026-11-09',to:'2026-11-09',filters:{path:'/docs'}});
  const url=new URL(workspaceUrl({...route,from:'2026-10-27'}),'http://local');
  expect(url.searchParams.get('from')).toBe('2026-11-09');
  expect(url.searchParams.get('to')).toBe('2026-11-09');
 });
 it('preserves existing report URLs and adds the directory and capability-gated traffic routes',()=>{
  const existing=['overview','realtime','pages','sources','audience','downloads','notFound','events','eventTrend','paths','goals','funnels','retention','userpaths','revenue','experiments','vitals','heatmap','replay','seo','gsc','seo-conversions','serp','suggestions','ai','reports','alerts','schedules','updates','settings','ga4','shares','members','tokens','audit','jobs','privacy','exports','channels'];
  for(const report of existing)expect(readWorkspaceRoute('?report='+report).report).toBe(report);
  expect(workspaceReports).toEqual(expect.arrayContaining([...existing,'sites','trend','visits','campaigns']));
  expect(new Set(workspaceReports).size).toBe(workspaceReports.length);
  expect(navigationGroups.flatMap(group=>group.reports)).not.toContain('overview');
 });
 it('round trips site, report, civil dates and all seven real filter dimensions',()=>{const state={siteId:'site-123',report:'sources',from:'2026-03-08',to:'2026-03-09',filters:{path:'/pricing',channel:'search',utm_source:'one',utm_medium:'two',utm_campaign:'三',utm_term:'four',utm_content:'five'}};expect(readWorkspaceRoute(new URL(workspaceUrl(state),'http://local').search)).toEqual(state);});
 it('never serializes unknown query keys, private questions, credentials or inherited filters',()=>{const state=readWorkspaceRoute('?site=site-123&report=ai&question=PRIVATE&apiKey=KEY&password=PW&__proto__=danger');const url=workspaceUrl(state);expect(url).toBe('/app?site=site-123&report=ai');expect(cleanFilters(Object.create({utm_source:'inherited-secret'}))).toEqual({});expect(cleanFilters({constructor:'x',utm_medium:'email'})).toEqual({utm_medium:'email'});});
 it('rejects malformed site/report/date and unordered periods without inventing timestamps',()=>{const state=readWorkspaceRoute('?site=%3Cscript%3E&report=constructor&from=2026-02-30&to=2026-02-20');expect(state).toMatchObject({siteId:'',report:'overview',from:'',notice:'invalid-context'});expect(readWorkspaceRoute('?from=2026-10-11&to=2026-10-10')).toMatchObject({from:'',to:'',notice:'invalid-context'});expect(validCivilDate('2024-02-29')).toBe(true);expect(validCivilDate('2026-02-29')).toBe(false);});
 it('bounds individual filters and rejects controls while retaining safe user values as text',()=>{expect(cleanFilters({path:'x'.repeat(1025),channel:'x'.repeat(101),utm_source:'x'.repeat(501),utm_medium:'a\nsecret',utm_campaign:' <b>用户文本</b> '})).toEqual({utm_campaign:'<b>用户文本</b>'});const url=workspaceUrl({siteId:'site-123',report:'pages',from:'',to:'',filters:{path:'/with?url=value&other=one'}});expect(new URL(url,'http://local').searchParams.get('path')).toBe('/with?url=value&other=one');});
});
