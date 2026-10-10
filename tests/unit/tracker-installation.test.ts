import {describe,it,expect} from 'vitest';
import {installationCode} from '../../src/web/InstallationSnippet';
import {consentLanguage} from '../../packages/tracker/src/consent-banner';
describe('optional consent installation',()=>{
 it('preserves ordinary single-script async installation',()=>{const code=installationCode('site','https://analytics.test/');expect(code).toContain('<script async defer');expect(code).not.toContain('tracker-consent');});
 it('uses two ordered deferred scripts without async for optional consent',()=>{const code=installationCode('site','https://analytics.test',{banner:true,language:'en'});expect(code.match(/<script defer/g)).toHaveLength(2);expect(code).not.toContain('async');expect(code.indexOf('/tracker.js')).toBeLessThan(code.indexOf('/tracker-consent.js'));expect(code).toContain('data-consent-required="true"');expect(code).toContain('data-language="en"');});
 it('escapes HTML attributes and limits banner language to supported fixed strings',()=>{expect(installationCode('"<site>','https://analytics.test',{banner:true})).toContain('&quot;&lt;site&gt;');expect(consentLanguage('en')).toBe('en');expect(consentLanguage('en-US')).toBe('zh-CN');expect(consentLanguage('<script>')).toBe('zh-CN');});
});
