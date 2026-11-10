import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SavedReport,SavedReportResult} from '../../src/web/SavedReport';

const dsl={from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z',path:'/docs',channel:'email',utm_source:'newsletter',utm_medium:'email',utm_campaign:'autumn',utm_content:'hero',utm_term:'guide'};
const report={id:'saved-1',name:'秋季邮件',dsl};
afterEach(()=>vi.unstubAllGlobals());
describe('saved report access and result presentation',()=>{
 it('keeps opening available to read-only members and removes editing and saving controls',()=>{
  const $=load(renderToStaticMarkup(createElement(SavedReport,{siteId:'site-1',from:dsl.from,to:dsl.to,reports:[report],canWrite:false,onSaved:()=>undefined})));
  expect($('button').map((_,el)=>$(el).text()).get()).toEqual(['打开']);
  expect($('form,input')).toHaveLength(0);
  expect($('.settings-record')).toHaveLength(1);
 });
 it('retains all saved filter inputs for authors inside a discoverable disclosure',()=>{
  const $=load(renderToStaticMarkup(createElement(SavedReport,{siteId:'site-1',from:dsl.from,to:dsl.to,filters:dsl,reports:[report],canWrite:true,onSaved:()=>undefined})));
  expect($('button').map((_,el)=>$(el).text()).get()).toContain('编辑');
  for(const [key,value] of Object.entries(dsl))expect($(`input[name="${key}"]`).val()).toBe(value);
  expect($('summary').map((_,el)=>$(el).text()).get()).toContain('保存当前筛选');
 });
 it('shows fallback rows when daily is empty and never presents unavailable visitors as zero',()=>{
  const $=load(renderToStaticMarkup(createElement(SavedReportResult,{result:{name:'邮件结果',summary:{pv:7,uv:null},coverage:.5,daily:[],rows:[{day:'2026-11-01',pv:7,uv:null}],dsl}})));
  expect($('tbody tr')).toHaveLength(1);expect($('tbody').text()).toContain('2026-11-01');
  expect($('.settings-facts').first().text()).toContain('浏览量7');expect($('.settings-facts').first().text()).toContain('此隐私模式下不可用');
  expect($('[role="status"]').text()).toContain('部分数据不可用');expect($('details dl').text()).toContain('/docs');
 });
 it('supports legacy dimension rows and English controls',()=>{
  vi.stubGlobal('localStorage',{getItem:()=> 'en'});
  const $=load(renderToStaticMarkup(createElement(SavedReportResult,{result:{name:'Legacy',summary:{pv:3,uv:2},daily:[],rows:[],dimensionRows:[{label:'newsletter',pv:3,uv:2}]}})));
  expect($('tbody').text()).toContain('newsletter');expect($('.settings-facts').first().text()).toContain('Visitors2');expect($('summary').text()).toContain('Report scope');
 });
});
