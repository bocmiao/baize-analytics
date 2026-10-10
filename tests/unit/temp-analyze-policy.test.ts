import {it,expect} from 'vitest';
import {shouldAnalyzeTempRows} from '../../src/server/temp-analyze-policy.js';
it('uses an explicit experimental threshold and rejects invalid counts',()=>{expect(shouldAnalyzeTempRows(0,1000)).toBe(false);expect(shouldAnalyzeTempRows(999,1000)).toBe(false);expect(shouldAnalyzeTempRows(1000,1000)).toBe(true);expect(shouldAnalyzeTempRows(1001,1000)).toBe(true);for(const n of[-1,0.5,NaN,Infinity])expect(()=>shouldAnalyzeTempRows(n,1000)).toThrow('TEMP_ANALYZE_POLICY_INVALID');expect(()=>shouldAnalyzeTempRows(100,0)).toThrow();});
