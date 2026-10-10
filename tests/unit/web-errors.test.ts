import {afterEach,describe,expect,it,vi} from 'vitest';
import {apiErrorMessage,localizedErrorCode} from '../../src/web/errorMessages.js';
import {ownValue} from '../../src/web/dictionary.js';
import {t} from '../../src/web/i18n.js';
afterEach(()=>vi.unstubAllGlobals());
describe('untrusted dictionary keys and public error localization',()=>{
 it.each(['constructor','toString','__proto__'])('does not resolve inherited %s values',key=>{
  vi.stubGlobal('localStorage',{getItem:()=> 'en'});
  expect(ownValue({pv:'Pageviews'},key)).toBeUndefined();expect(t(key)).toBe(key);
  expect(localizedErrorCode(key,500)).toBe('Internal service error. Try again later.');
  expect(apiErrorMessage({error:key,message:'private provider credential'},403)).not.toContain('private provider credential');
  expect(typeof apiErrorMessage({error:key},403)).toBe('string');
 });
 it('uses fixed messages in both languages and preserves HTTP status',()=>{
  vi.stubGlobal('localStorage',{getItem:()=> 'en'});expect(apiErrorMessage({error:'site_permission_denied'},403)).toBe('HTTP 403: You do not have permission for this site.');expect(apiErrorMessage({error:'connector_missing'},409)).toBe('HTTP 409: Configure the connector first.');expect(localizedErrorCode('replay_sequence_conflict',409)).toBe('This replay sequence already contains different masked content. The conflicting event was rejected.');
  vi.stubGlobal('localStorage',{getItem:()=> 'zh-CN'});expect(apiErrorMessage({error:'site_permission_denied'},403)).toBe('HTTP 403: 无此站点权限');expect(localizedErrorCode('replay_sequence_conflict',409)).toBe('此回放序号已存在不同的脱敏内容，冲突事件已拒绝。');
 });
});
