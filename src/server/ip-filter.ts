import ipaddr from 'ipaddr.js';
import {z} from 'zod';
function address(value:string){if(value.includes('%'))throw Error('不支持带接口区域的地址');return ipaddr.process(value);}
function compare(a:number[],b:number[]){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]!-b[i]!;return 0;}
export function normalizeIPFilter(value:string):string{
 const text=value.trim();if(text.includes("%"))throw Error("不支持带接口区域的地址");if(text.includes('-')){const parts=text.split('-').map(item=>item.trim());if(parts.length!==2)throw Error('IP范围无效');const first=address(parts[0]!),last=address(parts[1]!);if(first.kind()!==last.kind()||compare(first.toByteArray(),last.toByteArray())>0)throw Error('起止IP必须同一地址类型且按顺序填写');return `${first.toString()}-${last.toString()}`;}
 if(!text.includes('/'))return address(text).toString();
 let [network,bits]=ipaddr.parseCIDR(text);if(network.kind()==='ipv6'&&(network as ipaddr.IPv6).isIPv4MappedAddress()){if(bits<96)throw Error('映射IPv4的前缀至少为96');network=(network as ipaddr.IPv6).toIPv4Address();bits-=96;}
 const bytes=network.toByteArray().map((byte,index)=>{const remaining=bits-index*8;return remaining>=8?byte:remaining<=0?0:byte&(255<<(8-remaining));});return `${ipaddr.fromByteArray(bytes).toString()}/${bits}`;
}
export const ipFilterSchema=z.string().max(128).transform((value,ctx)=>{try{return normalizeIPFilter(value);}catch{ctx.addIssue({code:'custom',message:'请输入有效的IPv4、IPv6、CIDR或同类型的起止IP范围'});return z.NEVER;}});
export function matchesIPFilter(ip:string,value:string){try{const parsed=address(ip),rule=normalizeIPFilter(value);if(rule.includes('-')){const[first,last]=rule.split('-').map(address);return parsed.kind()===first!.kind()&&compare(parsed.toByteArray(),first!.toByteArray())>=0&&compare(parsed.toByteArray(),last!.toByteArray())<=0;}if(rule.includes('/')){const[network,bits]=ipaddr.parseCIDR(rule);return parsed.kind()===network.kind()&&parsed.match(network,bits);}const exact=address(rule);return parsed.kind()===exact.kind()&&compare(parsed.toByteArray(),exact.toByteArray())===0;}catch{return false;}}
