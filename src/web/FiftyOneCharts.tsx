import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core';
import {LineChart,BarChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([LineChart,BarChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);
export interface FiftyOneSeries {name:string;values:(number|null)[]}
const colors=['#1890ff','#ff941a','#69c3aa','#7c86df','#efb75b'];
export function FiftyOneChart({kind='line',labels,series,height=270}:{kind?:'line'|'bar'|'donut';labels:string[];series:FiftyOneSeries[];height?:number}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!host.current)return;
  const chart=echarts.init(host.current);
  const hasValues=series.some(item=>item.values.some(value=>typeof value==='number'&&Number.isFinite(value)));
  const base={animation:false,color:colors,graphic:hasValues?[]:[{type:'text',left:'center',top:'middle',style:{text:'暂无可用数据',fill:'#909399',fontSize:12}}],textStyle:{fontFamily:'"Helvetica Neue", Arial, "Microsoft YaHei", sans-serif',fontSize:12},tooltip:{trigger:kind==='donut'?'item':'axis',confine:true,renderMode:'richText',backgroundColor:'rgba(255,255,255,.97)',borderColor:'#e6e8eb',textStyle:{color:'#333',fontSize:12}},legend:{top:8,right:8,itemWidth:12,itemHeight:7,textStyle:{fontSize:12,color:'#666'}}};
  if(kind==='donut')chart.setOption({...base,legend:{show:false},series:[{type:'pie',radius:['54%','78%'],center:['50%','50%'],avoidLabelOverlap:true,label:{show:false},labelLine:{show:false},emptyCircleStyle:{color:'#edf1f5'},data:labels.flatMap((name,index)=>{const value=series[0]?.values[index];return typeof value==='number'&&Number.isFinite(value)&&value>0?[{name,value}]:[];})}]});
  else chart.setOption({...base,grid:{left:44,right:18,top:48,bottom:30},xAxis:{type:'category',data:labels,boundaryGap:kind==='bar',axisLine:{lineStyle:{color:'#e3e7eb'}},axisTick:{show:false},axisLabel:{color:'#92979c',hideOverlap:true}},yAxis:{type:'value',minInterval:1,axisLabel:{color:'#92979c'},splitLine:{lineStyle:{color:'#e9edf1',type:'dashed'}}},series:series.map((item,index)=>({name:item.name,type:kind,data:item.values,connectNulls:false,smooth:false,symbol:'circle',symbolSize:5,showSymbol:labels.length===1,lineStyle:{width:2},areaStyle:kind==='line'?{opacity:.12,color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:colors[index%colors.length]!},{offset:1,color:'rgba(255,255,255,0)'}])}:undefined,barMaxWidth:48,itemStyle:kind==='bar'?{borderRadius:[10,10,0,0]}:undefined}))});
  const observer=new ResizeObserver(()=>chart.resize());observer.observe(host.current);
  return()=>{observer.disconnect();chart.dispose();};
 },[kind,labels,series]);
 return <div className={`l51-chart l51-chart-${kind}`} ref={host} style={{height}} role="img" aria-label={`${series.map(item=>item.name).join('、')}${kind==='line'?'趋势图':kind==='bar'?'柱状图':'占比图'}`}/>;
}
