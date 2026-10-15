import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {api,requireUserResponse} from '../../src/web/api.js';
beforeEach(()=>vi.stubGlobal('localStorage',{getItem:()=> 'zh-CN'}));
afterEach(()=>vi.unstubAllGlobals());
describe('API response integrity and authenticated workspace',()=>{
 it('rejects a successful HTML/truncated response instead of exposing an error object as application data',async()=>{for(const body of ['<html>upstream failed</html>','{"user":']){vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{status:200})));await expect(api('/api/me')).rejects.toMatchObject({name:'ApiError',status:200,code:'invalid_api_response'});}});
 it('treats explicit error envelopes as failures even when an upstream returns HTTP 200',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'internal_error'}),{status:200})));await expect(api('/api/me')).rejects.toMatchObject({name:'ApiError',status:200});});
 it('keeps legitimate arrays and empty 204 responses usable',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('[{"id":"record"}]',{status:200})));expect(await api('/api/rows')).toEqual([{id:'record'}]);vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:204})));expect(await api('/api/logout',{},'POST')).toBeUndefined();});
 it('validates the authenticated user before rendering permission-dependent navigation',()=>{for(const invalid of [{},null,{user:null},{user:{id:'id',email:'a@example.test',name:'A',is_admin:'false'}}])expect(()=>requireUserResponse(invalid)).toThrow();expect(requireUserResponse({user:{id:'id',email:'a@example.test',name:'A',is_admin:false}}).is_admin).toBe(false);});
 it('signals expired sessions even when the response body is malformed',async()=>{const dispatchEvent=vi.fn();vi.stubGlobal('window',{location:{pathname:'/app'},dispatchEvent});vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>expired</html>',{status:401})));await expect(api('/api/me')).rejects.toMatchObject({status:401});expect(dispatchEvent).toHaveBeenCalledOnce();});
});
