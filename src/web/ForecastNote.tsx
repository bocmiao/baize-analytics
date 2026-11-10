import type {Row} from './api';
import {metricText} from './trafficModel';
const methods:Record<string,string>={historical_remaining:'历史同期走势',yesterday_remaining:'昨日同期走势',run_rate:'今日当前速度',observed_total:'当日已观测总量',none:'暂无估算'};
export function ForecastNote({forecast}:{forecast?:Row}){
 if(!forecast)return null;
 const details=(forecast.details||{}) as Record<string,Row>;
 return <details className="l51-forecast-note"><summary>流量预测依据与范围</summary><p>预测会随今日流量更新。范围反映历史波动，仅供观察，不计入已发生的流量。</p><div className="table-wrap"><table><thead><tr><th>指标</th><th>预计今日</th><th>参考范围</th><th>计算依据</th><th>历史天数</th></tr></thead><tbody>{[['pv','浏览量'],['uv','访客数'],['ips','独立 IP'],['sessions','会话数']].map(([key,label])=>{const item=details[key!]||{},interval=item.interval as Row|undefined;return <tr key={key}><td>{label}</td><td>{metricText(forecast[key!])}</td><td>{interval?`${metricText(interval.lower)} ~ ${metricText(interval.upper)}`:'—'}</td><td>{methods[String(item.method)]||'暂无估算'}{item.status!=='estimated'&&<small> · {String(item.reason||'等待完整样本')}</small>}</td><td>{metricText(item.sampleDays)}</td></tr>;})}</tbody></table></div></details>;
}
