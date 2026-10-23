import {ownValue} from './dictionary';
import {useEffect,useRef,useState} from 'react';
import * as echarts from 'echarts/core';
import {MapChart} from 'echarts/charts';
import {GeoComponent,TooltipComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import china from '../../packages/geography/china.json';
import type {Row} from './api';
import {t} from './i18n';
import {chartMotion,chartPalette} from './theme';
import {provinceAssets as names} from './geographyNames';

echarts.use([MapChart,GeoComponent,TooltipComponent,SVGRenderer]);
const assets=import.meta.glob('../../packages/geography/province/*.json',{import:'default'});
type GeographicAsset={features:{properties:{name:string};geometry:unknown}[]};

export default function GeographicMap({region,values,onRegion,onCity}:{region:string;values:Row[];onRegion:(region:string)=>void;onCity:(city:string)=>void}){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState(false),[themeTick,setThemeTick]=useState(0);
 useEffect(()=>{const onTheme=()=>setThemeTick(value=>value+1);window.addEventListener('baize-theme',onTheme);return()=>window.removeEventListener('baize-theme',onTheme);},[]);
 useEffect(()=>{
  let active=true,chart:echarts.ECharts|undefined,observer:ResizeObserver|undefined;
  setError(false);
  async function render(){
   try{
    const asset=region?await assets[`../../packages/geography/province/${ownValue(names,region)}.json`]?.():china;
    if(!active||!ref.current)return;
    const features=(asset as GeographicAsset|undefined)?.features;
    if(!features?.length||features.some(feature=>!feature.geometry||!feature.properties?.name))throw new Error('map_asset_unavailable');
    const palette=chartPalette(),mapName=region||'CN';
    echarts.registerMap(mapName,asset as Parameters<typeof echarts.registerMap>[1]);
    chart=echarts.init(ref.current,undefined,{renderer:'svg'});
    const normalize=(name:string)=>name.replace(/市$|地区$|自治州$/,'');
    // 缺少地域值时不制造零值，也不向地图布局传递 null。
    const data=features.flatMap(feature=>{
     const name=feature.properties.name,row=values.find(item=>region?normalize(String(item.city))===normalize(name):item.region===name);
     return row&&typeof row.pv==='number'&&Number.isFinite(row.pv)?[{name,value:row.pv,itemStyle:{areaColor:row.pv>0?palette.jade:palette.empty}}]:[];
    });
    chart.setOption({animation:chartMotion(),animationDuration:300,tooltip:{trigger:'item',renderMode:'richText',backgroundColor:palette.tip,borderWidth:0,textStyle:{color:palette.tipText},formatter:(params:unknown)=>{const item=params as {name:string;value:unknown};return `${item.name}: ${typeof item.value!=='number'||!Number.isFinite(item.value)?t('无已知地域数据'):item.value}`;}},series:[{type:'map',map:mapName,roam:false,label:{show:true,fontSize:10,color:palette.ink},itemStyle:{areaColor:palette.empty,borderColor:palette.line,borderWidth:.7},emphasis:{label:{show:true},itemStyle:{areaColor:palette.gold}},data}]});
    chart.on('click',params=>{if(typeof params.name==='string'){if(region)onCity(params.name);else if(ownValue(names,params.name))onRegion(params.name);}});
    observer=new ResizeObserver(()=>{try{if(chart&&!chart.isDisposed())chart.resize();}catch{if(active)setError(true);}});
    observer.observe(ref.current);
   }catch{chart?.dispose();chart=undefined;if(active)setError(true);}
  }
  void render();
  return()=>{active=false;observer?.disconnect();chart?.dispose();};
 },[region,values,onRegion,onCity,themeTick]);
 return <>{error&&<p className="notice" role="status">{t('地图暂不可用，请查看下方地域明细。')}</p>}<div ref={ref} hidden={error} className="chart geography-map" role="img" aria-label={region?`${region} ${t('省市地图')}`:t('中国省级地图')}/></>;
}
