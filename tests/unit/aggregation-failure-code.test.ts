import {expect,it} from 'vitest';
import {aggregationFailureCode} from '../../src/server/worker.js';
it('persists only fixed safe retention errors or actual native PG codes',()=>{
 expect(aggregationFailureCode(Error('FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN'))).toBe('FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN');
 expect(aggregationFailureCode({code:'25P04',message:'private connection detail'})).toBe('25P04');
 expect(aggregationFailureCode(Error('private SQL / payload'))).toBe('WORKER_FAILURE');
 expect(aggregationFailureCode({code:{toString(){throw Error('unsafe');}}})).toBe('WORKER_FAILURE');
});
it('hostile error accessors cannot derail worker failure persistence',()=>{
 const error=Object.defineProperties({},{code:{get(){throw Error('secret');}},message:{get(){throw Error('secret');}}});
 expect(aggregationFailureCode(error)).toBe('WORKER_FAILURE');
 expect(aggregationFailureCode(null)).toBe('WORKER_FAILURE');
});
