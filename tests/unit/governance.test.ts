import { describe,it,expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { csvCell,seal,unseal,hashToken,passwordHash,checkPassword,validateFrameOrigins,replayIsMasked } from '../../src/server/governance.js';
describe('governance security',()=>{
 it('encrypts and authenticates channel credentials',()=>{const key=randomBytes(32),value=seal({password:'secret'},key);expect(value).not.toContain('secret');expect(unseal(value,key)).toEqual({password:'secret'});expect(()=>unseal(value,randomBytes(32))).toThrow();});
 it('hashes unique access tokens and verifies salted passwords',()=>{expect(hashToken('a')).not.toEqual(hashToken('b'));const hash=passwordHash('long password');expect(checkPassword('long password',hash)).toBe(true);expect(checkPassword('wrong',hash)).toBe(false);});
 it('escapes CSV formulas, quotes and newlines',()=>{expect(csvCell('=cmd()')).toBe('"\'=cmd()"');expect(csvCell('a"b\nc')).toBe('"a""b\nc"');});
 it('requires exact CSP origins',()=>{expect(validateFrameOrigins(['https://example.com'])).toEqual(['https://example.com']);expect(()=>validateFrameOrigins(['https://example.com/path'])).toThrow();expect(()=>validateFrameOrigins(['https://example.com; unsafe-inline'])).toThrow();});
 it('rejects replay plaintext and sensitive names',()=>{expect(replayIsMasked({value:'secret'})).toBe(false);expect(replayIsMasked([{type:2,timestamp:1,data:{node:{tagName:'div',textContent:'***',attributes:{width:'10'}}}}])).toBe(true);expect(replayIsMasked({password:'***'})).toBe(false);expect(replayIsMasked([{type:2,timestamp:1,data:{node:{tagName:'input',attributes:{value:'***',id:'user@example.test'}}}}])).toBe(false);expect(replayIsMasked([{type:4,timestamp:1,data:{href:'https://private.example/path'}}])).toBe(false);});
});
