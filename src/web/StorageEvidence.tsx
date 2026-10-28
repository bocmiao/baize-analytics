import {language} from './i18n';
import {ownValue} from './dictionary';
export function storageSourceLabel(value:unknown,en:boolean){const labels:Record<string,string>=en?{postgres:'PostgreSQL',mysql:'MySQL',mariadb:'MariaDB',clickhouse:'ClickHouse',mixed:'Mixed verified sources',hybrid:'Mixed verified sources',unavailable:'Unavailable'}:{postgres:'PostgreSQL',mysql:'MySQL',mariadb:'MariaDB',clickhouse:'ClickHouse',mixed:'混合已核验来源',hybrid:'混合已核验来源',unavailable:'不可用'};return typeof value==='string'?ownValue(labels,value)??'—':'—'}
export function StorageEvidence({storage}:{storage:unknown}){
 if(!storage||typeof storage!=='object'||Array.isArray(storage))return null;const value=storage as Record<string,unknown>,en=language()==='en';const source=Object.hasOwn(value,'rollups')?value.rollups:Object.hasOwn(value,'source')?value.source:undefined;if(source===undefined)return null;
 return <p className="watermark" aria-live="polite">{en?'Verified query source: ':'本次查询核验来源：'}{storageSourceLabel(source,en)}{en?'. This is this query. Missing records are not shown as zero.':'。这是本次查询。缺记录不显示为 0。'}</p>
}
