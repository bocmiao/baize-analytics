import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,expect,it} from 'vitest';
import {SharedDashboard} from '../../src/web/SharedDashboard';
import type {SharedReport} from '../../src/server/shared-dashboard';

const report:SharedReport={totals:{pv:0,uv:null,ips:null,sessions:0,bounceRate:null,averageDuration:null},trend:[{time:'2025-12-31T23:00:00.000Z',pv:2,uv:1,ips:null,sessions:1},{time:'2026-01-01T00:00:00.000Z',pv:0,uv:null,ips:null,sessions:0}],sources:[{label:'direct',pv:2}],pages:[{label:'/<script>test</script>',pv:2}],devices:[{label:'mobile',pv:2}],geography:[{label:'CN',pv:2}]};
const render=(extra:Record<string,unknown>={})=>load(renderToStaticMarkup(createElement(SharedDashboard,{data:{site_name:'测试站',report,coverage:1,timezone:'UTC',rangeStatus:'complete',range:{from:'2025-12-31T23:00:00.000Z',to:'2026-01-01T01:00:00.000Z'},...extra}})));
describe('public shared dashboard presentation',()=>{
 it('keeps zero and unavailable metrics distinct without implying an unspecified privacy mode',()=>{const $=render();expect($('.shared-metrics dd').map((_,item)=>$(item).text()).get()).toEqual(['0','—','—','0','—','—']);expect($.text()).not.toContain('隐私模式');expect($('.shared-coverage')).toHaveLength(0);});
 it('shows actual partial coverage, without a warning for a fully covered clamped range',()=>{expect(render({coverage:.75,rangeStatus:'partial_unavailable'})('.shared-coverage').text()).toContain('75%');expect(render({rangeStatus:'future_clamped'})('.shared-coverage')).toHaveLength(0);expect(render({privacy:'daily_salt_no_cross_day_uv'}).text()).toContain('不合并跨日');});
 it('keeps hourly rows sortable across years and exposes all aggregate rankings safely',()=>{const $=render();expect($('.shared-heading').text()).toContain('2025');expect($('.shared-heading').text()).toContain('2026');expect($('.feature-disclosure tbody tr').first().text()).toContain('2026');expect($('.shared-dashboard-grid .dense-panel')).toHaveLength(4);expect($('.shared-dashboard-grid .dense-pagination')).toHaveLength(0);expect($('.feature-disclosure .dense-pagination')).toHaveLength(1);expect($('.shared-footnote').text()).toContain('搜索和下载仅限当前榜单');expect($('.shared-dashboard script')).toHaveLength(0);expect($.text()).toContain('/<script>test</script>');});
});
