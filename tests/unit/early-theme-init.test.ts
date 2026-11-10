import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readTheme} from '../../src/web/theme';

const script=readFileSync(new URL('../../public/theme-init.js',import.meta.url),'utf8');
afterEach(()=>vi.unstubAllGlobals());
describe('first paint theme initialization',()=>{
 it.each([
  {search:'?theme=dark',stored:'light',expected:'dark'},
  {search:'?theme=light',stored:'dark',expected:'light'},
  {search:'?theme=other',stored:'dark',expected:'dark'},
  {search:'',stored:'dark',expected:'dark'},
  {search:'',stored:'light',expected:'light'},
  {search:'',stored:null,expected:'light'},
  {search:'',stored:'invalid',expected:'light'},
 ])('matches application theme selection: $search / $stored',({search,stored,expected})=>{
  const location={search},localStorage={getItem:vi.fn(()=>stored)},dataset:Record<string,string>={},setAttribute=vi.fn();
  const root=Object.freeze({dataset});
  runInNewContext(script,{URLSearchParams,location,localStorage,document:{documentElement:root,querySelector:()=>({setAttribute})}});
  vi.stubGlobal('location',location);vi.stubGlobal('localStorage',localStorage);
  expect(dataset.theme).toBe(expected);expect(dataset.theme).toBe(readTheme());
  expect(setAttribute).toHaveBeenCalledWith('content',expected==='dark'?'#0f1725':'#f5f7fb');
  expect(root).not.toHaveProperty('style');
 });
 it('uses light when storage access is blocked and works without a theme meta tag',()=>{
  const dataset:Record<string,string>={};
  runInNewContext(script,{URLSearchParams,location:{search:''},localStorage:{getItem(){throw new Error('blocked');}},document:{documentElement:{dataset},querySelector:()=>null}});
  expect(dataset.theme).toBe('light');
 });
 it('does not touch storage for an explicit query theme',()=>{
  const dataset:Record<string,string>={},getItem=vi.fn(()=>{throw new Error('blocked');});
  runInNewContext(script,{URLSearchParams,location:{search:'?theme=dark'},localStorage:{getItem},document:{documentElement:{dataset},querySelector:()=>null}});
  expect(dataset.theme).toBe('dark');expect(getItem).not.toHaveBeenCalled();
 });
 it('loads synchronously from the same origin in the head before the application bundle',()=>{
  const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const tag=html.match(/<script\b[^>]*src="\/theme-init\.js"[^>]*><\/script>/)?.[0];
  expect(tag).toBeDefined();expect(tag).not.toMatch(/\b(?:async|defer|type)=?/);
  expect(html.indexOf(tag!)).toBeLessThan(html.indexOf('</head>'));
  expect(html.indexOf(tag!)).toBeLessThan(html.indexOf('/src/web/main.tsx'));
  expect(Buffer.byteLength(script)).toBeLessThan(1024);
 });
});
