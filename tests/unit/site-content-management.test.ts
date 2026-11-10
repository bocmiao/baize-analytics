import {describe,expect,it} from 'vitest';
import jsQR from 'jsqr';
import {buildCampaignUrl,campaignInputSchema} from '../../packages/contracts/campaign.js';
import {directoryLabels,readDirectoryRules,type DirectoryRule} from '../../src/server/site-content-management.js';
import {campaignQr} from '../../src/web/campaignQr.js';
import {campaignAnalysisScope,selectCampaignLevel} from '../../src/web/campaignAnalysisModel.js';

const rule=(patch:Partial<DirectoryRule>={}):DirectoryRule=>({id:'83af2776-6b9a-4fb9-b3e2-247739e26c5e',name:'文档',path:'/docs',match:'prefix',enabled:true,createdAt:'2026-11-10T00:00:00.000Z',updatedAt:'2026-11-10T00:00:00.000Z',...patch});
const campaign=()=>campaignInputSchema.parse({name:'中文推广',targetUrl:'https://例子.中国/教程?keep=one&keep=two&utm_source=old&utm_term=old#part',parameters:{utm_source:'微信 & 社群',utm_campaign:'11 月',utm_medium:'二维码',utm_content:'版本 A',utm_term:''}});

describe('directory and campaign resources',()=>{
 it('matches path boundaries, exact paths and independent overlapping directories',()=>{
  const rules=[rule(),rule({id:'537b7500-8716-456d-8c96-fdc4607cdab4',name:'全部',path:'/'}),rule({name:'开始',match:'exact',path:'/docs/start'})];
  expect(directoryLabels('/docs/start?private=yes#part',rules)).toEqual(['文档','全部','开始']);
  expect(directoryLabels('/docsmith',rules)).toEqual(['全部']);
  expect(directoryLabels('/docs/start/child',rules)).toEqual(['文档','全部']);
  expect(directoryLabels('/other',[rule()])).toEqual(['未分组']);
 });
 it('retains automatic parent directories when rules are absent or all disabled',()=>{
  expect(directoryLabels('/docs/start')).toEqual(['/docs/']);expect(directoryLabels('/docs/start',[rule({enabled:false})])).toEqual(['/docs/']);expect(directoryLabels('/')).toEqual(['/']);
  expect(readDirectoryRules({directory_rules:[rule(),{name:'broken'}]})).toEqual([rule()]);
 });
 it('preserves unrelated URL query and fragment, encodes IDN and all UTM values, and clears empty UTM fields',()=>{
  const result=new URL(buildCampaignUrl(campaign()));expect(result.hostname).toBe('xn--fsqu00a.xn--fiqs8s');expect(result.searchParams.getAll('keep')).toEqual(['one','two']);expect(result.hash).toBe('#part');expect(result.searchParams.get('utm_source')).toBe('微信 & 社群');expect(result.searchParams.get('utm_campaign')).toBe('11 月');expect(result.searchParams.has('utm_term')).toBe(false);
 });
 it.each(['javascript:alert(1)','ftp://example.org','https://user:password@example.org','https://example.org/\nsecret'])('rejects unsafe target URL %s',targetUrl=>{
  expect(()=>buildCampaignUrl({...campaign(),targetUrl})).toThrow();
 });
 it('bounds encoded URL size rather than silently producing an unscannable QR',()=>{
  expect(()=>buildCampaignUrl({...campaign(),targetUrl:'https://example.org/'+('x'.repeat(1980))})).toThrow('2000');
 });
 it('decodes the locally generated QR back to the complete campaign URL',()=>{
  const value=buildCampaignUrl(campaign()),code=campaignQr(value),scale=6,width=code.size*scale,pixels=new Uint8ClampedArray(width*width*4).fill(255);
  for(let y=0;y<code.modules.size;y++)for(let x=0;x<code.modules.size;x++)if(code.modules.get(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+4)*scale+dy)*width+(x+4)*scale+dx)*4;pixels[i]=0;pixels[i+1]=0;pixels[i+2]=0;}
  expect(jsQR(pixels,width,width)?.data).toBe(value);expect(code.svg).not.toContain(value);expect(code.svg).not.toContain('<script');
 });
 it('keeps global filters and date range through campaign drilldown and resets deeper levels',()=>{
  const query='from=2026-11-01T00%3A00%3A00Z&to=2026-11-10T00%3A00%3A00Z&path=%2Flanding';
  const selected=selectCampaignLevel({utm_source:'old',utm_campaign:'old',utm_medium:'old'},'utm_source','wechat');expect(selected).toEqual({utm_source:'wechat'});
  const scope=campaignAnalysisScope(query,selected,'utm_content'),params=new URLSearchParams(scope.query);expect(scope.field).toBe('utm_campaign');expect(scope.dimension).toBe('campaign');expect(params.get('utm_source')).toBe('wechat');expect(params.get('path')).toBe('/landing');expect(params.get('from')).toBe('2026-11-01T00:00:00Z');
  expect(campaignAnalysisScope(query,{utm_source:'wechat',utm_campaign:'launch',utm_medium:'social'},'utm_term').dimension).toBe('utm_term');
 });
});
