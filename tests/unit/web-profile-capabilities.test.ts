import {expect,it} from 'vitest';
import {parseProfile,supportsReport} from '../../src/web/profile';
it('keeps standard existing reports and directory available while withholding unsupported traffic APIs',()=>{
 const standard=parseProfile({profile:'standard'});
 expect(supportsReport(standard,'overview')).toBe(true);
 expect(supportsReport(standard,'sites')).toBe(true);
 expect(supportsReport(standard,'visits')).toBe(false);
 expect(supportsReport(parseProfile({profile:'standard',capabilities:{trafficReports:true}}),'visits')).toBe(true);
});
it('keeps Lite report restrictions with the directory and no implicit traffic capability',()=>{
 const lite=parseProfile({profile:'lite',reports:['overview','seo'],capabilities:{manualSEO:true}});
 expect(supportsReport(lite,'overview')).toBe(true);
 expect(supportsReport(lite,'seo')).toBe(true);
 expect(supportsReport(lite,'revenue')).toBe(false);
 expect(supportsReport(lite,'sites')).toBe(true);
 expect(supportsReport(lite,'campaigns')).toBe(false);
});
