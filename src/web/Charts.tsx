import {useEffect,useRef} from 'react';
import type {Row} from './api';
import * as echarts from 'echarts/core';
import {LineChart,SankeyChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([LineChart,SankeyChart,GridComponent,TooltipComponent,CanvasRenderer]);
function readable(v:unknown):string{return String(v??'—');}
function Chart({data}:{data:Row[]}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current||!data.length)return;const chart=echarts.init(ref.current);chart.setOption({tooltip:{trigger:'axis'},grid:{left:48,right:20,bottom:30,top:25},xAxis:{type:'category',data:data.map(r=>readable(r.time||r.day||r.hour||r.date)),axisLine:{lineStyle:{color:'#c5d5cf'}}},yAxis:{type:'value',minInterval:1},series:[{name:'浏览量',type:'line',smooth:true,data:data.map(r=>Number(r.pv||0)),lineStyle:{color:'#18876a',width:3},areaStyle:{color:'#d7eee5'}}]});const resize=()=>chart.resize();window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);chart.dispose();};},[data]);return <div ref={ref} className="chart" role="img" aria-label="浏览量趋势"/>;}
function PathChart({data}:{data:Row[]}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current||!data.length)return;const chart=echarts.init(ref.current);const names=new Set<string>();const links=data.slice(0,20).map(r=>{const source=`起点 ${r.source}`,target=`终点 ${r.target}`;names.add(source);names.add(target);return {source,target,value:Number(r.count)};});chart.setOption({tooltip:{trigger:'item'},series:[{type:'sankey',data:[...names].map(name=>({name})),links,emphasis:{focus:'adjacency'},lineStyle:{color:'gradient',curveness:.5}}]});return()=>chart.dispose();},[data]);return <div ref={ref} className="chart" role="img" aria-label="页面流向桑基图"/>;}

export default function Visualization({data,paths=false}:{data:Row[];paths?:boolean}){return paths?<PathChart data={data}/>:<Chart data={data}/>;}
