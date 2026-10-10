import { useEffect, useRef } from 'react';
import type { Row } from './api';
import { t } from './i18n';
import * as echarts from 'echarts/core';
import { LineChart, SankeyChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, SankeyChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
function readable(v: unknown): string { return String(v ?? '—'); }
function Chart({ data, metricLabel = '浏览量' }: {
    metricLabel?: string;
    data: Row[];
}) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { if (!ref.current || !data.length)
    return; const chart = echarts.init(ref.current); chart.setOption({ animation: false, tooltip: { trigger: 'axis' }, grid: { left: 48, right: 20, bottom: 30, top: 25 }, xAxis: { type: 'category', data: data.map(r => readable(r.time || r.day || r.hour || r.date)), axisLine: { lineStyle: { color: '#c5d5cf' } } }, yAxis: { type: 'value', minInterval: 1 }, series: [{ name: t(metricLabel), type: 'line', symbol: 'circle', symbolSize: 7, showSymbol: true, smooth: true, data: data.map(r => Number(r.pv || 0)), lineStyle: { color: '#18876a', width: 3 }, areaStyle: { color: '#d7eee5' } }] }); const resize = () => chart.resize(); window.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); chart.dispose(); }; }, [data,metricLabel]); return <div ref={ref} className="chart" role="img" aria-label={`${t(metricLabel)} ${t('趋势')}`}/>; }
function PathChart({ data }: {
    data: Row[];
}) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { if (!ref.current || !data.length)
    return; const chart = echarts.init(ref.current); const names = new Set<string>(); const links = data.slice(0, 20).map(r => { const source = `${t('起点')} ${r.source}`, target = `${t('终点')} ${r.target}`; names.add(source); names.add(target); return { source, target, value: Number(r.count) }; }); chart.setOption({ animation: false, tooltip: { trigger: 'item' }, series: [{ type: 'sankey', data: [...names].map(name => ({ name })), links, emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', curveness: .5 } }] }); return () => chart.dispose(); }, [data]); return <div ref={ref} className="chart" role="img" aria-label={t('页面流向桑基图')}/>; }
export default function Visualization({ data, paths = false, metricLabel }: {
    data: Row[];
    paths?: boolean;
    metricLabel?: string;
}) { return paths ? <PathChart data={data}/> : <Chart data={data} metricLabel={metricLabel}/>; }
export function HistoryChart({data}:{data:Row[]}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current)return;const chart=echarts.init(ref.current);chart.setOption({animation:false,tooltip:{trigger:'axis'},legend:{data:[t('本站已聚合 PV'),t('GA4 历史聚合 PV')]},grid:{left:48,right:20,top:40,bottom:35},xAxis:{type:'category',data:data.map(r=>r.day)},yAxis:{type:'value',minInterval:1},series:[{name:t('本站已聚合 PV'),type:'line',data:data.map(r=>r.localPV),symbol:'circle',symbolSize:6,lineStyle:{color:'#18876a'}},{name:t('GA4 历史聚合 PV'),type:'line',data:data.map(r=>r.historicalPV),symbol:'circle',symbolSize:6,lineStyle:{color:'#986dd1',type:'dashed'}}]});return()=>chart.dispose();},[data]);return <div className="chart" ref={ref} role="img" aria-label={t('GA4 历史聚合虚线对照')}/>;}
export function EvidenceChart({series,metricLabel}:{series:{dimension:string;unit:string;points:{label:string;value:number|null}[]};metricLabel:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current)return;const chart=echarts.init(ref.current);chart.setOption({animation:false,tooltip:{trigger:'axis',renderMode:'richText'},grid:{left:58,right:24,bottom:70,top:30},xAxis:{type:'category',data:series.points.map(point=>point.label),axisLabel:{rotate:series.dimension==='day'?0:25,overflow:'truncate',width:120}},yAxis:{type:'value',min:0,axisLabel:{formatter:series.unit==='ratio'?(value:number)=>`${(value*100).toFixed(0)}%`:'{value}'}},series:[{name:metricLabel,type:'line',connectNulls:false,data:series.points.map(point=>point.value),symbol:'circle',symbolSize:7,lineStyle:{color:'#18876a'},areaStyle:{color:'#d7eee5'}}]});const resize=()=>chart.resize();window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);chart.dispose();};},[series,metricLabel]);return <div ref={ref} className="chart" role="img" aria-label={`${metricLabel} ${t('语义查询图表')}`}/>;}
