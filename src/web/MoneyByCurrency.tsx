import {formatMoney} from './moneyFormat';

/** Each currency stays separate and each exact amount stays on one line in a
 * horizontally scrollable report table. No exchange or sum is inferred. */
export function MoneyByCurrency({value,locale='zh-CN'}:{value:unknown;locale?:string}){
 if(!value||typeof value!=='object'||Array.isArray(value))return <>—</>;
 const entries=Object.entries(value);return entries.length?<span className="money-currencies">{entries.map(([currency,amount],index)=><span key={currency}>{currency}: {formatMoney(amount,locale)}{index<entries.length-1?'; ':''}</span>)}</span>:<>—</>;
}
