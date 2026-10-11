import {it,expect} from 'vitest';
import {createSchedulerLagObservation} from '../../scripts/benchmark/independent-scheduler.js';
it('records exact target/actual lateness in bounded bins and preserves unknown versus zero',()=>{
 const lag=createSchedulerLagObservation();expect(lag.snapshot()).toMatchObject({samples:0,meanLatenessMs:null,maxLatenessMs:null});lag.record(100,100);lag.record(125,135);lag.record(150,5150);lag.record(NaN,1);lag.record(1,Infinity);lag.record(3,2);const result=lag.snapshot();expect(result).toMatchObject({samples:3,cumulativeLatenessMs:5010,meanLatenessMs:1670,maxLatenessMs:5000});expect(result.histogram).toHaveLength(9);expect(result.histogram.reduce((sum,n)=>sum+n,0)).toBe(3);expect(result.histogram[0]).toBe(1);expect(result.histogram[2]).toBe(1);expect(result.histogram[7]).toBe(1);
 for(let i=0;i<100000;i++)lag.record(i,i+2);expect(lag.snapshot().histogram).toHaveLength(9);expect(lag.snapshot().samples).toBe(100003);
});
