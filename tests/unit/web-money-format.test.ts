import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MoneyByCurrency} from '../../src/web/MoneyByCurrency';
import {formatMoney,isMoneyDecimal,moneyChartValue} from '../../src/web/moneyFormat';

describe('exact API decimal money display',()=>{
 it('keeps micro amounts, zero and every digit beyond binary integer precision',()=>{
  expect(formatMoney('0.000000000000000001','en-US',{maximumFractionDigits:2})).toBe('0.000000000000000001');
  expect(formatMoney('0')).toBe('0');expect(formatMoney('0.0000')).toBe('0.0000');
  expect(formatMoney('9007199254740993.000000000000000001','zh-CN')).toBe('9,007,199,254,740,993.000000000000000001');
  expect(formatMoney('-0.000000000000000001','en-US')).toBe('-0.000000000000000001');
  const huge='9'.repeat(1000)+'.123456789012345678';expect(formatMoney(huge,'en-US').replaceAll(',','')).toBe(huge);
 });
 it('preserves existing Node numeric formatting at each caller',()=>{
  expect(formatMoney(1234.567,'en-US')).toBe('1234.567');
  expect(formatMoney(1234.567,'en-US',{maximumFractionDigits:2})).toBe('1,234.57');
  expect(formatMoney(0,'en-US',{maximumFractionDigits:2})).toBe('0');
  for(const value of [NaN,Infinity,-Infinity])expect(formatMoney(value)).toBe('—');
 });
 it('rejects coercible, malformed and unbounded values instead of inventing amounts',()=>{
  for(const value of ['', ' ', ' 1', '1 ', '1\n','1\r','1\u2028', '+1','01','.5','1.','1e-18','0x10','1,000.00','NaN','Infinity','1_000',{},[],null,undefined,true,'0'.repeat(4097)]){expect(isMoneyDecimal(value)).toBe(false);expect(formatMoney(value)).toBe('—');}
 });
 it('keeps currencies separate in identity and generic report cells',()=>{
  const markup=renderToStaticMarkup(createElement(MoneyByCurrency,{value:{USD:'0.000000000000000001',JPY:'0',EUR:'9007199254740993',CNY:99.95},locale:'en-US'}));expect(markup.replace(/<[^>]+>/g,'')).toBe('USD: 0.000000000000000001; JPY: 0; EUR: 9,007,199,254,740,993; CNY: 99.95');expect(markup.match(/<span>/g)).toHaveLength(4);
  expect(renderToStaticMarkup(createElement(MoneyByCurrency,{value:{USD:'invalid'}}))).toContain('USD: —');expect(renderToStaticMarkup(createElement(MoneyByCurrency,{value:{}}))).toBe('—');expect(renderToStaticMarkup(createElement(MoneyByCurrency,{value:[]}))).toBe('—');
 });
 it('plots round-trip safe decimals while refusing rounded, overflowed or underflowed coordinates',()=>{
  expect(moneyChartValue('0.000000000000000001')).toBe(1e-18);expect(moneyChartValue('0')).toBe(0);expect(moneyChartValue('12.3400')).toBe(12.34);
  for(const value of ['9007199254740993.000000000000000001','9007199254740991.5','0.100000000000000001','0.'+'0'.repeat(1000)+'1','invalid',null])expect(moneyChartValue(value)).toBeNull();
  expect(moneyChartValue(99.95)).toBe(99.95);
 });
});
