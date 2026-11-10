import {createElement} from 'react';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {WorkspaceNavigation} from '../../src/web/WorkspaceNavigation';
import {navigationSections,permittedNavigation,referenceNavigation} from '../../src/web/51laNavigation';
import {readWorkspaceRoute,secondaryWorkspaceReports,workspaceReports} from '../../src/web/workspaceRoute';

const keys=(groups=referenceNavigation)=>groups.flatMap(group=>group.links.map(link=>link.key));
const render=(report='overview',allowed:readonly string[]=workspaceReports)=>load(renderToStaticMarkup(createElement(WorkspaceNavigation,{route:{siteId:'site-test',report,from:'2026-11-01',to:'2026-11-10',filters:{path:'/docs'}},items:allowed.map(key=>[key,key]),onNavigate:()=>undefined,children:()=>createElement('select',{'aria-label':'选择站点'},createElement('option',{},'测试站'))})));

describe('Baize customer navigation',()=>{
 it('keeps ten task groups and every statistics route exactly once',()=>{
  expect(referenceNavigation.map(group=>group.zh)).toEqual(['概况','实时','流量','来源','内容','访客','转化','行为','推广','设置']);
  expect(new Set(keys()).size).toBe(keys().length);
  expect(keys()).toEqual(expect.arrayContaining(['daily','visits','audience','downloads','notFound','vitals','reports','eventTrend','events','paths','userpaths','goals','funnels','retention','heatmap','replay','bots','channelSettings','eventManagement']));
  expect([...keys(),...secondaryWorkspaceReports].sort()).toEqual([...workspaceReports].sort());
 });
 it('keeps secondary feature URLs valid while removing their default menu entries',()=>{
  const $=render();for(const report of secondaryWorkspaceReports){expect(readWorkspaceRoute('?report='+report).report).toBe(report);expect($(`nav a[href*="report=${report}&"]`)).toHaveLength(0);expect(keys()).not.toContain(report);}
  expect($.text()).not.toContain('更多功能');expect($('.la51-extra-group')).toHaveLength(0);expect($('.brand-name').text()).toContain('白泽统计');
 });
 it('never adds links excluded by the permission or capability list',()=>{
  const allowed=['overview','sources','events','reports','audience','downloads','userpaths','realtime'];
  expect(keys(permittedNavigation(allowed)).sort()).toEqual([...allowed].sort());
  const $=render('events',allowed),links=$('nav a').toArray().map(node=>new URL($(node).attr('href')!,'http://local').searchParams.get('report'));
  expect(links.sort()).toEqual([...allowed].sort());expect($('#la51-nav-configuration')).toHaveLength(0);expect($('.baize-nav-settings-section')).toHaveLength(0);
 });
 it('retains a permitted daily report even when overview is unavailable',()=>{
  const $=render('daily',['daily','pages']);expect($('nav a[aria-current="page"]').text()).toBe('日报');expect($('nav a').toArray().map(node=>new URL($(node).attr('href')!,'http://local').searchParams.get('report'))).toEqual(['daily','pages']);
 });
 it('puts operational controls in settings disclosures and opens the selected section',()=>{
  const settings=referenceNavigation.find(group=>group.id==='configuration')!;
  for(const key of ['jobs','tokens','audit','updates'])expect(settings.links.find(link=>link.key===key)?.section).toBe('administration');
  expect(navigationSections.map(section=>section.zh)).toEqual(['通知与报告','高级管理']);
  const closed=render('settings');expect(closed('.baize-nav-settings-section[open]')).toHaveLength(0);expect(closed('.baize-nav-settings-section>summary .baize-settings-chevron')).toHaveLength(2);
  const selected=render('jobs');expect(selected('#la51-nav-configuration').attr('hidden')).toBeUndefined();expect(selected('.baize-nav-settings-section[open] > summary').text()).toBe('高级管理');expect(selected('nav a[aria-current="page"]').text()).toBe('任务管理');
 });
 it('keeps selected report, dates and filters in links and a named keyboard disclosure',()=>{
  const $=render('paths'),group=$('#la51-nav-behavior');expect(group.attr('hidden')).toBeUndefined();expect(group.prev('button').attr('aria-expanded')).toBe('true');expect(group.prev('button').attr('aria-controls')).toBe('la51-nav-behavior');
  const url=new URL($('nav a[aria-current="page"]').attr('href')!,'http://local');expect(url.searchParams.get('site')).toBe('site-test');expect(url.searchParams.get('from')).toBe('2026-11-01');expect(url.searchParams.get('path')).toBe('/docs');expect($('#la51-sidebar').attr('aria-label')).toBe('分析与设置');
 });
});
