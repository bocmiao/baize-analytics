/** Only canonical decimal text from the API is accepted; no coercion or exponent input. */
export function isMoneyDecimal(value:unknown):value is string {
 return typeof value==='string'&&value.length<=4096&&value.trim()===value&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

/** String amounts never pass through Number or currency rounding. Number callers
 * retain their existing plain/Intl formatting by supplying the same options. */
export function formatMoney(value:unknown,locale='zh-CN',numberOptions?:Intl.NumberFormatOptions):string {
 if(typeof value==='number')return Number.isFinite(value)?numberOptions?value.toLocaleString(locale,numberOptions):String(value):'—';
 if(!isMoneyDecimal(value))return '—';
 const negative=value.startsWith('-'),[whole,fraction]=value.replace(/^-/,'').split('.');
 const integer=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(BigInt(whole));
 const sign=negative?new Intl.NumberFormat(locale).formatToParts(-1).find(part=>part.type==='minusSign')?.value||'-':'';
 const separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==='decimal')?.value||'.';
 return sign+integer+(fraction===undefined?'':separator+fraction);
}

function canonical(value:string){const [whole,fraction='']=value.split('.');const decimal=fraction.replace(/0+$/,'');return `${whole}${decimal?'.'+decimal:''}`.replace(/^-0$/, '0');}
/** Expand only the finite Number's own representation, never arbitrary API text. */
function numberDecimal(value:number){
 const text=String(value);if(!/[eE]/.test(text))return text;
 const negative=text.startsWith('-'),[mantissa,exponent]=text.replace(/^-/,'').split(/[eE]/),[whole,fraction='']=mantissa.split('.'),digits=whole+fraction,point=whole.length+Number(exponent);
 return (negative?'-':'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}

/** Canvas coordinates are binary floats. Reject lossy decimal coordinates and
 * retain the exact amount in the adjacent table and tooltip instead. */
export function moneyChartValue(value:unknown):number|null {
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(!isMoneyDecimal(value))return null;
 const whole=value.replace(/^-/,'').split('.')[0];
 if(BigInt(whole)>BigInt(Number.MAX_SAFE_INTEGER))return null;
 const coordinate=Number(value);
 return Number.isFinite(coordinate)&&canonical(value)===canonical(numberDecimal(coordinate))?coordinate:null;
}
