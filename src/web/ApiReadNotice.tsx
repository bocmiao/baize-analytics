import {apiReadMetadata} from './api';
import {language} from './i18n';

/** Keep array response contracts while making the server's missing evidence visible. */
export function ApiReadNotice({data,kind}:{data:unknown;kind:'heatmap'|'replay'}){
 const metadata=apiReadMetadata(data);if(!metadata||!metadata.truncated&&(metadata.coverage===undefined||metadata.coverage>=1))return null;
 const english=language()==='en';const evidence=metadata.evidenceFrom&&Number.isFinite(Date.parse(metadata.evidenceFrom))?new Date(metadata.evidenceFrom).toLocaleString(english?'en-US':'zh-CN',{timeZone:'UTC'}):null;
 return <section className="notice" role="status"><p>{kind==='heatmap'?(english?'Earlier heatmap records are unavailable. These points show the records that remain; an empty area does not prove zero historical visits.':'更早的热图记录不可用。当前点位只代表已有记录，空白不能证明历史访问为零。'):(english?'This replay list reached the read limit and does not contain every recording.':'回放列表已达到本次读取上限，当前列表未包含全部录像。')}</p>{evidence&&<small>{english?'Available records begin: ':'已有记录起点：'}{evidence} UTC</small>}</section>;
}
