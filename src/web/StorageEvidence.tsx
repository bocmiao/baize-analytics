import {language} from './i18n';
import {ownValue} from './dictionary';
export function storageSourceLabel(value:unknown,en:boolean){const labels:Record<string,string>=en?{postgres:'PostgreSQL',clickhouse:'ClickHouse',mixed:'Mixed verified sources',hybrid:'Mixed verified sources',unavailable:'Unavailable'}:{postgres:'PostgreSQL',clickhouse:'ClickHouse',mixed:'混合已核验来源',hybrid:'混合已核验来源',unavailable:'不可用'};return typeof value==='string'?ownValue(labels,value)??'—':'—'}
export function StorageEvidence({storage}:{storage:unknown}){
 if(!storage||typeof storage!=='object'||Array.isArray(storage))return null;const value=storage as Record<string,unknown>,en=language()==='en';const source=Object.hasOwn(value,'rollups')?value.rollups:Object.hasOwn(value,'source')?value.source:undefined;if(source===undefined)return null;
 return <p className="watermark" aria-live="polite">{en?'Verified query source: ':'本次查询核验来源：'}{storageSourceLabel(source,en)}{en?'. This describes this query, not all site data. Missing authoritative bodies cause a request error and are never counted as zero.':'。仅描述本次查询，不代表站点全部数据；权威正文缺失会使请求失败，不计为零。'}</p>
}
