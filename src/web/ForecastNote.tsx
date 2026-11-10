import type {Row} from './api';
import {metricText} from './trafficModel';

const methods:Record<string,string>={historical_remaining:'历史同期走势',yesterday_remaining:'昨日同期走势',run_rate:'今日当前速度',observed_total:'当日实测值',none:'暂无估算'};
const confidence:Record<string,string>={medium:'中等',low:'较低',none:'—'};
export function ForecastNote({forecast}:{forecast?:Row}){
 if(!forecast)return null;
 const details=(forecast.details||{}) as Record<string,Row>;
 const estimates=Object.values(details).filter(item=>item.status==='estimated');
 const status=!estimates.length?'等待完整样本':estimates.some(item=>item.confidence==='low')?'参考度较低':estimates.some(item=>item.confidence==='medium')?'参考度中等':'当日实测值';
 return <details className="l51-forecast-note">
  <summary><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 4.5v1"/></svg><span>预测说明</span><span className="l51-forecast-status">{status}</span></summary>
  <div className="l51-forecast-content">
   <p>预测随今日流量更新，参考范围来自历史波动，不计入实际流量。</p>
   <div className="table-wrap" tabIndex={0} role="region" aria-label="流量预测依据"><table><thead><tr><th>指标</th><th>预计今日</th><th>参考范围</th><th>计算依据</th><th>历史天数</th><th>参考度</th></tr></thead><tbody>{[['pv','浏览量'],['uv','访客数'],['ips','独立 IP'],['sessions','会话数']].map(([key,label])=>{const item=details[key!]||{},interval=item.interval as Row|undefined;return <tr key={key}><th scope="row">{label}</th><td>{metricText(forecast[key!])}</td><td>{interval?`${metricText(interval.lower)} – ${metricText(interval.upper)}`:'—'}</td><td title={String(item.reason||'')}>{methods[String(item.method)]||'暂无估算'}{item.status!=='estimated'&&<small>{String(item.reason||'等待完整样本')}</small>}</td><td>{metricText(item.sampleDays)}</td><td>{confidence[String(item.confidence)]||'—'}</td></tr>;})}</tbody></table></div>
  </div>
 </details>;
}
