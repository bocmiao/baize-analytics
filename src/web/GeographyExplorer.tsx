import {provinceAssets} from './geographyNames';
import {useCallback,useEffect,useState,lazy,Suspense} from 'react';
import {rows,type Row} from './api';
import {DensePanel,DenseTable,MetricStrip,MetricTabs,useReportRead,type DenseColumn} from './DensePrimitives';
import {FiftyOneChart} from './FiftyOneCharts';
import {metricNames,metricText} from './trafficModel';
const GeographicMap=lazy(()=>import('./GeographicMap'));
const geoName=(value:unknown)=>!value||value==='unknown'?'未知':String(value);
const countryName=(value:unknown)=>{const code=geoName(value);try{return code==='未知'?code:new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(code)||code;}catch{return code;}};
const cityName=(value:unknown)=>String(value||'').replace(/市$|地区$|自治州$/,'');
const metrics:DenseColumn[]=[{key:'pv',label:'浏览量（PV）'},{key:'uv',label:'访客数（UV）'},{key:'ips',label:'独立 IP'}];

export function GeographyExplorer({siteId,query,geographyStatus}:{siteId:string;query:string;geographyStatus?:string}){
 const [country,setCountry]=useState('CN'),[region,setRegion]=useState(''),[city,setCity]=useState(''),[isp,setIsp]=useState(''),[metric,setMetric]=useState('pv'),[level,setLevel]=useState<'countries'|'regions'|'cities'>('regions');
 useEffect(()=>{setCountry('CN');setRegion('');setCity('');setIsp('');setLevel('regions');},[siteId]);
 const params=new URLSearchParams(query);for(const [key,value] of Object.entries({country,region,city,isp})){params.delete(key);if(value)params.set(key,value);}
 const state=useReportRead(`/api/v1/sites/${siteId}/geography?${params}`),data=state.data||{},selection=(data.selected||{}) as Row,totals=(selection.totals||{}) as Row;
 const chooseRegion=useCallback((value:string)=>{setRegion(value);setCity('');setIsp('');setLevel(value?'cities':'regions');},[]);
 const chooseCity=useCallback((value:string)=>{setCity(value);setIsp('');setLevel('cities');},[]);
 const chooseCountry=(value:string)=>{setCountry(value);setRegion('');setCity('');setIsp('');setLevel(value?'regions':'countries');};
 const cities=rows(data.cities),providers=rows(data.isps),trend=rows(data.trend),unconfigured=['unknown','unavailable','disabled'].includes(String(geographyStatus||''));
 const selectedLabel=[country?countryName(country):'全部国家',region,city,isp?geoName(isp):''].filter(Boolean).join(' / ');
 const displayed=rows(data[level]).filter(row=>level!=='cities'||!city||cityName(row.city)===cityName(city));
 const locationColumns:DenseColumn[]=level==='countries'?[{key:'country',label:'国家 / 地区',render:row=><button type="button" className="dense-text-button" onClick={()=>chooseCountry(String(row.country))}>{countryName(row.country)}</button>}]:[
  {key:'country',label:'国家 / 地区',render:row=>countryName(row.country)},
  {key:'region',label:'省 / 区域',render:row=><button type="button" className="dense-text-button" onClick={()=>{setCountry(String(row.country));chooseRegion(String(row.region));}}>{geoName(row.region)}</button>},
  ...(level==='cities'?[{key:'city',label:'城市',render:(row:Row)=><button type="button" className="dense-text-button" onClick={()=>chooseCity(String(row.city))}>{geoName(row.city)}</button>}]:[])
 ];
 const unavailable:Record<string,string>={outside_raw_retention:'这个时间范围超出明细保留期，暂不能按地域细分。',raw_detail_retired:'这个时间范围的原始明细已清理，地域细分暂不可用。',detail_limit_exceeded:'明细超过查询上限，请缩短时间范围。',detail_unavailable:'明细暂不可用，请稍后重试。',future_only:'所选时间尚未发生。'};
 return <div className="geography-explorer">
  <DensePanel title="地域筛选">
   <div className="segment-filters">
    <label>国家<select aria-label="国家 / 地区" value={country} onChange={event=>chooseCountry(event.target.value)}><option value="">全部国家</option><option value="CN">中国</option>{country&&country!=='CN'&&!rows(data.countries).some(row=>row.country===country)&&<option value={country}>{countryName(country)}</option>}{rows(data.countries).filter(row=>row.country!=='CN').map(row=><option key={String(row.country)} value={String(row.country)}>{countryName(row.country)}</option>)}</select></label>
    <label>省 / 区域<select aria-label="省 / 区域" value={region} onChange={event=>chooseRegion(event.target.value)}><option value="">全部区域</option>{(country==='CN'?Object.keys(provinceAssets):[...new Set(rows(data.regions).map(row=>String(row.region)))]).map(name=><option key={name} value={name}>{geoName(name)}</option>)}{region&&country==='CN'&&!Object.hasOwn(provinceAssets,region)&&<option value={region}>{geoName(region)}</option>}</select></label>
    <label>城市<select aria-label="城市" value={city} onChange={event=>chooseCity(event.target.value)}><option value="">全部城市</option>{city&&!cities.some(row=>String(row.city)===city)&&<option value={city}>{geoName(city)}</option>}{[...new Set(cities.map(row=>String(row.city)))].map(name=><option key={name} value={name}>{geoName(name)}</option>)}</select></label>
    <label>运营商<select aria-label="运营商" value={isp} onChange={event=>setIsp(event.target.value)}><option value="">全部运营商</option>{isp&&!providers.some(row=>String(row.isp)===isp)&&<option value={isp}>{geoName(isp)}</option>}{providers.map(row=><option key={String(row.isp)} value={String(row.isp)}>{geoName(row.isp)}</option>)}</select></label>
    <button type="button" className="secondary" onClick={()=>chooseCountry('')}>重置筛选</button>
   </div>
   {state.error&&<p role="alert" className="error">{state.error}</p>}
   {!state.data&&!state.error&&<p className="dense-note" role="status">正在加载地域数据…</p>}
   {unavailable[String(data.status)]&&<p className="notice" role="status">{unavailable[String(data.status)]}</p>}
   <p className="dense-note">当前：{selectedLabel} · 明细覆盖 {Math.round(Number(data.coverage||0)*100)}% · 地域已知 {Math.round(Number(data.geographyCoverage||0)*100)}%</p>
   <MetricStrip totals={totals} metrics={['pv','uv','ips']}/>
   {totals.ipStatus==='partial_ip_identity'&&<p className="dense-note">部分历史记录没有完整 IP 标识，已知独立 IP 为 {metricText(totals.knownIps)}，覆盖 {Math.round(Number(totals.ipCoverage)*100)}%。</p>}
   {totals.ipStatus==='not_collected'&&<p className="dense-note">这段时间的记录没有采集完整 IP 标识，独立 IP 显示为 —。</p>}
   {data.uvStatus==='unsupported_in_this_mode'&&<p className="dense-note">当前隐私模式不合并跨日访客；每日趋势仍按当天访客去重。</p>}
  </DensePanel>
  <div className="dense-two">
   <DensePanel title="地域分布" action={<MetricTabs value={metric} onChange={setMetric} metrics={['pv','uv','ips']} label="地域图表指标"/>}>
    {unconfigured?<p className="dense-note">地域库未配置；已知位置仍显示在下方明细中。</p>:country==='CN'?<><p className="dense-note">按{metricNames[metric]}显示。点击省份或城市继续查看，灰色表示没有可用值。</p>{region&&<button type="button" className="secondary" onClick={()=>chooseRegion('')}>返回中国省级地图</button>}<Suspense fallback={<p className="dense-note">正在加载地图…</p>}><GeographicMap region={region} values={(region?cities:rows(data.regions)).map(row=>({...row,pv:typeof row[metric]==='number'?row[metric]:null}))} onRegion={chooseRegion} onCity={chooseCity}/></Suspense></>:<><p className="dense-note">选择中国可查看省市地图。其他国家的地域分布见下方表格。</p><DenseTable data={rows(data.countries)} columns={[{key:'country',label:'国家 / 地区',render:row=><button type="button" className="dense-text-button" onClick={()=>chooseCountry(String(row.country))}>{countryName(row.country)}</button>},...metrics]} exportName="国家分布" searchable={false}/></>}
   </DensePanel>
   <DensePanel title="选定地域趋势" action={<span className="dense-note">{metricNames[metric]}</span>}>
    <p className="dense-note">{selectedLabel} · 按站点时区逐日统计</p>
    <FiftyOneChart labels={trend.map(row=>String(row.time))} series={[{name:metricNames[metric]||metric,values:trend.map(row=>typeof row[metric]==='number'?row[metric] as number:null)}]} height={330}/>
   </DensePanel>
  </div>
  <DensePanel title="地域明细" action={<div className="dense-tabs" role="group" aria-label="地域层级">{([['countries','国家'],['regions','省 / 区域'],['cities','城市']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={level===value} onClick={()=>setLevel(value)}>{label}</button>)}</div>}>
   <DenseTable key={level} data={displayed} columns={[...locationColumns,...metrics]} exportName="地域明细" searchLabel="搜索国家、省份或城市"/>
   <p className="dense-note">未知地域：{rows(data.countries).filter(row=>row.country==='unknown').reduce((sum,row)=>sum+Number(row.pv),0)} PV。各地域独立去重，同一 IP 在多个地域出现时，合计不会重复相加。</p>
  </DensePanel>
  <DensePanel title="选定地域的运营商" action={isp?<button type="button" className="secondary" onClick={()=>setIsp('')}>清除运营商筛选</button>:undefined}>
   <DenseTable data={providers} columns={[{key:'isp',label:'运营商',render:row=><button type="button" className="dense-text-button" onClick={()=>setIsp(String(row.isp))}>{geoName(row.isp)}</button>},...metrics]} exportName="地域运营商" searchLabel="搜索运营商"/>
  </DensePanel>
 </div>;
}
