import {expect,it} from 'vitest';
import {parseProfile,supportsReport} from '../../src/web/profile';
it('keeps standard existing reports and directory available while withholding unsupported traffic APIs',()=>{
 const standard=parseProfile({profile:'standard'});
 expect(supportsReport(standard,'overview')).toBe(true);
 expect(supportsReport(standard,'sites')).toBe(true);
 expect(supportsReport(standard,'visits')).toBe(false);
 expect(supportsReport(standard,'daily')).toBe(false);
 for(const report of ['pages','sources','events','realtime'])expect(supportsReport(standard,report)).toBe(true);
 expect(supportsReport(parseProfile({profile:'standard',capabilities:{trafficReports:true}}),'visits')).toBe(true);
});
it('does not hide existing standard reports when trafficReports is explicitly false',()=>{
 const profile=parseProfile({profile:'standard',capabilities:{trafficReports:false}});
 for(const report of ['pages','sources','events','realtime'])expect(supportsReport(profile,report)).toBe(true);
 for(const report of ['daily','visits','trend','sourceSummary'])expect(supportsReport(profile,report)).toBe(false);
});
it('keeps the Lite report allowlist and explicit per-report exclusions for legacy core reports',()=>{
 const profile=parseProfile({profile:'lite',reports:['pages','sources','events','realtime'],capabilities:{trafficReports:false,events:false}});
 for(const report of ['pages','sources','realtime'])expect(supportsReport(profile,report)).toBe(true);
 expect(supportsReport(profile,'events')).toBe(false);
 expect(supportsReport(profile,'daily')).toBe(false);
 const limited=parseProfile({profile:'lite',reports:['pages'],capabilities:{trafficReports:true}});
 expect(supportsReport(limited,'pages')).toBe(true);
 for(const report of ['sources','events','realtime'])expect(supportsReport(limited,report)).toBe(false);
 expect(supportsReport(limited,'daily')).toBe(true);
});
it('requires an explicit true new-report capability',()=>{
 for(const value of [undefined,false,'true',1]){
  const profile=parseProfile({profile:'standard',capabilities:{trafficReports:value}});
  expect(supportsReport(profile,'daily')).toBe(false);
 }
 const profile=parseProfile({profile:'standard',capabilities:{trafficReports:true}});
 for(const report of ['daily','visits','trend','sourceSummary'])expect(supportsReport(profile,report)).toBe(true);
});
it('keeps Lite report restrictions with the directory and no implicit traffic capability',()=>{
 const lite=parseProfile({profile:'lite',reports:['overview','seo'],capabilities:{manualSEO:true}});
 expect(supportsReport(lite,'overview')).toBe(true);
 expect(supportsReport(lite,'seo')).toBe(true);
 expect(supportsReport(lite,'revenue')).toBe(false);
 expect(supportsReport(lite,'sites')).toBe(true);
 expect(supportsReport(lite,'campaigns')).toBe(false);
});
