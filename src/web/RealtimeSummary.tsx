import {ownValue} from './dictionary';
import {t} from './i18n';
import type {Row} from './api';
export function RealtimeSummary({data}:{data:Row}) {
 const metadata=(data.realtime||{}) as Row;
 const complete=metadata.status==='complete'&&metadata.coverage===1;
 const labels:Record<string,string>={path:t('页面'),channel:t('渠道'),referrer:t('来源'),country:t('国家'),region:t('区域'),city:t('城市'),pv:t('浏览量'),uv:t('访客')};
 return <section className="panel"><h3>{t('实时完整窗口汇总')}</h3><p>{t('近 5 分钟活跃：')}{typeof data.online==='number'?data.online:'—'}</p><p>{t('最近30分钟浏览量')}：<strong data-testid="realtime-total">{complete?String(metadata.pv):'—'}</strong> · {t('覆盖率')}：{Math.round(Number(metadata.coverage||0)*100)}%</p><p>{String(metadata.from||'—')} — {String(metadata.to||'—')}</p><p>{t('下方事件仅为最近200条预览，不能作为完整流量或Top统计。')}</p>{!complete&&<p className="notice">{t('实时窗口不完整，Top不可用，不显示伪零值。')}</p>}{[['topPages','实时Top页面'],['topSources','实时Top来源'],['topGeography','实时Top地域']].map(([key,title])=><section key={key} aria-label={t(title)}><h4>{t(title)}</h4>{complete&&Array.isArray(data[key])?<div className="table-wrap"><table><thead><tr>{Object.keys((data[key] as Row[])[0]||{}).map(key=><th key={key}>{ownValue(labels,key)||key}</th>)}</tr></thead><tbody>{(data[key] as Row[]).map((row,index)=><tr key={index}>{Object.values(row).map((value,index)=><td key={index}>{value===null?'—':String(value)}</td>)}</tr>)}</tbody></table></div>:<p>—</p>}</section>)}</section>;
}
