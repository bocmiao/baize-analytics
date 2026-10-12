import{afterEach,expect,it,vi}from'vitest';
import{t}from'../../src/web/i18n.js';
afterEach(()=>vi.unstubAllGlobals());
it.each([['en','Signing out…','Submitting…'],['zh-CN','正在退出…','正在提交…']])('provides native %s feedback during logout and metadata submission', (locale,logout,submission)=>{
 vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='baize_language'?locale:null});expect(t('正在退出…')).toBe(logout);expect(t('正在提交…')).toBe(submission);
});
