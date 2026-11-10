import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core';
import {LineChart,BarChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([LineChart,BarChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);
export interface FiftyOneSeries {name:string;values:(number|null)[]}
type ChartData={kind:'line'|'bar'|'donut';labels:string[];series:FiftyOneSeries[]};
/** A mounted chart keeps its canvas, legend state and observers across data refreshes. */
export function mountFiftyOneChart(element:HTMLDivElement){
  const chart=echarts.init(element);
  let current:ChartData|undefined,signature='',disposed=false;
  function render(){
   if(disposed||!current)return;
   const {kind,labels,series}=current;
   const hasValues=series.some(item=>item.values.some(value=>typeof value==='number'&&Number.isFinite(value)));
   const selected=(chart.getOption() as {legend?:{selected?:Record<string,boolean>}[]}).legend?.[0]?.selected;
   const style=getComputedStyle(element),token=(name:string,fallback:string)=>style.getPropertyValue(name).trim()||fallback;
   const colors=[token('--accent','#2563eb'),token('--chart-prev','#94a3b8'),token('--chart-teal','#14b8a6'),'#64748b','#60a5fa'];
   const foreground=token('--fg','#17243b'),muted=token('--fg-2','#5c6b80'),surface=token('--surface','#ffffff'),grid=token('--chart-grid','#e6ebf2'),axis=token('--chart-axis','#68788d');
   const base={animation:false,color:colors,graphic:hasValues?[]:[{type:'text',left:'center',top:'middle',style:{text:'暂无可用数据',fill:muted,fontSize:12}}],textStyle:{fontFamily:'Inter, "Noto Sans SC", sans-serif',fontSize:12},tooltip:{trigger:kind==='donut'?'item':'axis',confine:true,renderMode:'richText',backgroundColor:surface,borderColor:grid,borderWidth:1,padding:[10,12],textStyle:{color:foreground,fontSize:12},axisPointer:{type:kind==='bar'?'shadow':'line',lineStyle:{color:axis,type:'dashed'},shadowStyle:{color:token('--accent-soft','#eff5ff')}}},legend:{top:12,right:8,itemWidth:12,itemHeight:7,itemGap:18,textStyle:{fontSize:11,color:muted},inactiveColor:grid,selected:Object.fromEntries(series.filter(item=>typeof selected?.[item.name]==='boolean').map(item=>[item.name,selected![item.name]]))}};
   if(kind==='donut')chart.setOption({...base,legend:{show:false},series:[{type:'pie',radius:['56%','76%'],center:['50%','50%'],avoidLabelOverlap:true,label:{show:false},labelLine:{show:false},emptyCircleStyle:{color:grid},itemStyle:{borderColor:surface,borderWidth:3},data:labels.flatMap((name,index)=>{const value=series[0]?.values[index];return typeof value==='number'&&Number.isFinite(value)&&value>0?[{name,value}]:[];})}]},{notMerge:true});
   else chart.setOption({...base,grid:{left:42,right:16,top:48,bottom:28,containLabel:false},xAxis:{type:'category',data:labels,boundaryGap:kind==='bar',axisLine:{lineStyle:{color:grid}},axisTick:{show:false},axisLabel:{color:axis,hideOverlap:true,fontSize:11,margin:12,formatter:(label:string)=>/^\d{4}-\d{2}-\d{2}$/.test(label)?label.slice(5):label}},yAxis:{type:'value',minInterval:1,axisLabel:{color:axis,fontSize:11},splitLine:{lineStyle:{color:grid,type:'dashed'}}},series:series.map((item,index)=>({name:item.name,type:kind,data:item.values,connectNulls:false,smooth:false,symbol:'circle',symbolSize:5,showSymbol:labels.length===1,lineStyle:{width:2,type:index===1?'dashed':'solid'},areaStyle:kind==='line'&&index===0?{opacity:.06}:undefined,barMaxWidth:34,barGap:'45%',itemStyle:kind==='bar'?{borderRadius:[4,4,0,0]}:undefined}))},{notMerge:true});
  }
  const resizeObserver=new ResizeObserver(()=>{if(!disposed)chart.resize();});resizeObserver.observe(element);
  const themeObserver=new MutationObserver(render);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
  return {update(data:ChartData){if(disposed)return;const next=JSON.stringify(data);if(next===signature)return;signature=next;current=data;render();},dispose(){if(disposed)return;disposed=true;resizeObserver.disconnect();themeObserver.disconnect();chart.dispose();}};
}
export function FiftyOneChart({kind='line',labels,series,height=270}:{kind?:'line'|'bar'|'donut';labels:string[];series:FiftyOneSeries[];height?:number}){
 const host=useRef<HTMLDivElement>(null),chart=useRef<ReturnType<typeof mountFiftyOneChart>|null>(null);
 useEffect(()=>{
  if(!host.current)return;
  const mounted=mountFiftyOneChart(host.current);chart.current=mounted;
  return()=>{chart.current=null;mounted.dispose();};
 },[]);
 useEffect(()=>{
  chart.current?.update({kind,labels,series});
 },[kind,labels,series]);
 return <div className={`l51-chart l51-chart-${kind}`} ref={host} style={{height}} role="img" aria-label={`${series.map(item=>item.name).join('、')}${kind==='line'?'趋势图':kind==='bar'?'柱状图':'占比图'}`}/>;
}
