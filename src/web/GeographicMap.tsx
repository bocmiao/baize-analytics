import { useEffect,useRef } from 'react';
import * as echarts from 'echarts/core';
import { MapChart } from 'echarts/charts';
import { GeoComponent,TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import china from '../../packages/geography/china.json';
import type { Row } from './api';
import { t } from './i18n';
echarts.use([MapChart,GeoComponent,TooltipComponent,SVGRenderer]);
const assets=import.meta.glob('../../packages/geography/province/*.json',{import:'default'});
import { provinceAssets as names } from './geographyNames';
type GeographicAsset={features:{properties:{name:string}}[]};
export default function GeographicMap({region,values,onRegion,onCity}:{region:string;values:Row[];onRegion:(region:string)=>void;onCity:(city:string)=>void}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{let active=true;let chart:echarts.ECharts|undefined;async function render(){if(!ref.current)return;const mapName=region||'CN';const asset=region?await assets[`../../packages/geography/province/${names[region]}.json`]?.():china;if(!asset||!active)return;echarts.registerMap(mapName,asset as Parameters<typeof echarts.registerMap>[1]);chart=echarts.init(ref.current,undefined,{renderer:'svg'});const features=(asset as GeographicAsset).features;const normalize=(name:string)=>name.replace(/市$|地区$|自治州$/,'');const data=features.map(feature=>{const label=feature.properties.name;const row=values.find(item=>region?normalize(String(item.city))===normalize(label):item.region===label);return {name:label,value:row?Number(row.pv):null,itemStyle:{areaColor:row&&Number(row.pv)>0?'#18876a':'#edf2ef'}};});chart.setOption({animation:false,tooltip:{trigger:'item',formatter:(params:unknown)=>{const item=params as {name:string;value:unknown};return `${item.name}: ${item.value==null||!Number.isFinite(Number(item.value))?t('无已知地域数据'):item.value}`;}},series:[{type:'map',map:mapName,roam:false,label:{show:true,fontSize:10,color:'#243b33'},itemStyle:{borderColor:'#879b92',borderWidth:.7},emphasis:{label:{show:true},itemStyle:{areaColor:'#b5d9c8'}},data}]});chart.on('click',params=>{if(typeof params.name==='string'){if(region)onCity(params.name);else if(names[params.name])onRegion(params.name);}});}void render();const resize=()=>chart?.resize();window.addEventListener('resize',resize);return()=>{active=false;window.removeEventListener('resize',resize);chart?.dispose();};},[region,values,onRegion,onCity]);return <div ref={ref} className="chart geography-map" role="img" aria-label={region?`${region} ${t('省市地图')}`:t('中国省级地图')}/>;}
