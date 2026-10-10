import {expect,it} from 'vitest';
import {canonical} from '../../src/server/security.js';
import {canonicalForValidation} from '../../src/server/canonical-validation.js';
import {createHmac,createHash} from 'node:crypto';
it('matches original canonical bytes including Unicode, prototype keys and typed nested values',()=>{
 const row=JSON.parse('{"__proto__":{"雪":"中文😀"},"constructor":false,"toString":null,"values":[0,-0,1.25,1e+30,true,false,null,{"é":"é","\\u2028":"x"}]}');
 const serialize=canonicalForValidation();const normalized={row,visitorId:'访客',sessionId:'session'};const source={aggregationEpoch:'epoch',canonicalEpoch:null,deletionEpoch:'0'};
 for(const input of [normalized,{...normalized,kind:'effects',source,bodySeal:'seal'},['derived-fact-store-v1','site','effects',normalized,source],[row.constructor,row.values]]){
  expect(serialize(input)).toBe(canonical(input));expect(Buffer.byteLength(serialize(input))).toBe(Buffer.byteLength(canonical(input)));
  expect(createHmac('sha256','local').update(serialize(input)).digest('hex')).toBe(createHmac('sha256','local').update(canonical(input)).digest('hex'));
  expect(createHash('sha256').update(serialize(input)).digest('hex')).toBe(createHash('sha256').update(canonical(input)).digest('hex'));
 }
});
it('does not reuse bytes between validations after a different normalized record is produced',()=>{const row={value:1};expect(canonicalForValidation()(row)).toBe(canonical(row));row.value=2;expect(canonicalForValidation()(row)).toBe(canonical(row));});
it('reuses an immutable normalized subtree within only one validation',()=>{let reads=0;const row={get value(){reads++;return 'stable';}};const serialize=canonicalForValidation();expect(serialize({row})).toBe('{"row":{"value":"stable"}}');serialize(['domain',row]);expect(reads).toBe(1);});
it('does not cache later wire provenance or envelope objects',()=>{const serialize=canonicalForValidation();serialize({row:{value:1},visitorId:'normalized'});const wire={unknown:'first'};expect(serialize(wire)).toBe(canonical(wire));wire.unknown='second';expect(serialize(wire)).toBe(canonical(wire));});
