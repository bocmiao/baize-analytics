import{beforeEach,afterEach,describe,it,expect,vi}from'vitest';
import{api,ApiError,safeWorkspaceReturn}from'../../src/web/api.js';
beforeEach(()=>vi.stubGlobal('localStorage',{getItem:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
describe('session recovery status and local return scope',()=>{
 it.each([401,403])('retains HTTP %s and machine code independently of localized copy',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:status===401?'session_expired':'site_permission_required'}),{status,headers:{'content-type':'application/json'}})));
 const error=await api('/api/me').catch(reason=>reason);expect(error).toBeInstanceOf(ApiError);expect(error.status).toBe(status);expect(error.code).toBe(status===401?'session_expired':'site_permission_required');
 });
 it('keeps workspace dates and filters but rejects external and unrelated return routes',()=>{
 const scope='/app?site=synthetic&report=pages&from=2026-10-01&to=2026-10-02&path=%2Fdocs';expect(safeWorkspaceReturn(scope,'https://local.example')).toBe(scope);
 for(const value of ['https://evil.example/app','//evil.example/app','/\\evil.example/app','/login','/app/other','/app#external','/api/setup',null])expect(safeWorkspaceReturn(value,'https://local.example')).toBe('/app');
 });
 it('dispatches recovery only for workspace 401, preserving 403 permission handling',async()=>{
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{location:{pathname:'/app'},dispatchEvent});vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'session_expired'}),{status:401})).mockResolvedValueOnce(new Response(JSON.stringify({code:'site_permission_required'}),{status:403})));
 await api('/api/v1/sites/synthetic/stats').catch(()=>{});expect(dispatchEvent).toHaveBeenCalledTimes(1);await api('/api/v1/sites/synthetic/stats').catch(()=>{});expect(dispatchEvent).toHaveBeenCalledTimes(1);
 });
 it('does not redirect a rejected ordinary login',async()=>{
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{location:{pathname:'/login'},dispatchEvent});vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'login_invalid'}),{status:401})));
 await expect(api('/api/login',{email:'synthetic@example.test',password:'invalid-fixture'})).rejects.toMatchObject({status:401,code:'login_invalid'});expect(dispatchEvent).not.toHaveBeenCalled();
 });

});
