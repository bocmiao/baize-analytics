import {afterEach,beforeEach,describe,expect,it,vi,type Mock} from 'vitest';
import {mountFiftyOneChart} from '../../src/web/FiftyOneCharts';

const chart=vi.hoisted(()=>({init:vi.fn(),setOption:vi.fn(),getOption:vi.fn(),resize:vi.fn(),dispose:vi.fn()}));
vi.mock('echarts/core',()=>({use:vi.fn(),init:chart.init}));

describe('persistent report chart lifecycle',()=>{
 let resize:()=>void,theme:()=>void,foreground:string;
 let resizeDisconnect:Mock<()=>void>,themeDisconnect:Mock<()=>void>;
 const element={} as HTMLDivElement;
 beforeEach(()=>{
  vi.clearAllMocks();chart.init.mockReturnValue(chart);chart.getOption.mockReturnValue(undefined);
  resizeDisconnect=vi.fn();themeDisconnect=vi.fn();foreground='#17243b';
  vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resize=callback;}observe(){}disconnect(){resizeDisconnect();}});
  vi.stubGlobal('MutationObserver',class{constructor(callback:()=>void){theme=callback;}observe(){}disconnect(){themeDisconnect();}});
  vi.stubGlobal('document',{documentElement:{}});
  vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:(name:string)=>name==='--fg'?foreground:''}));
 });
 afterEach(()=>vi.unstubAllGlobals());
 it('renders the first dataset when ECharts has no option before its first setOption',()=>{
  const mounted=mountFiftyOneChart(element);
  expect(chart.getOption()).toBeUndefined();
  expect(()=>mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[5]}]})).not.toThrow();
  expect(chart.setOption.mock.lastCall?.[0].legend.selected).toEqual({});
  expect(chart.setOption.mock.lastCall?.[0].series[0].data).toEqual([5]);
  expect(chart.init).toHaveBeenCalledOnce();mounted.dispose();
 });
 it('keeps one canvas and skips identical newly allocated parent data',()=>{
  const mounted=mountFiftyOneChart(element);
  mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[5]}]});
  mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[5]}]});
  expect(chart.init).toHaveBeenCalledOnce();expect(chart.setOption).toHaveBeenCalledOnce();
  mounted.update({kind:'line',labels:['10:00','11:00'],series:[{name:'PV',values:[5,7]}]});
  expect(chart.init).toHaveBeenCalledOnce();expect(chart.dispose).not.toHaveBeenCalled();
  expect(chart.setOption).toHaveBeenCalledTimes(2);
  expect(chart.setOption.mock.lastCall?.[0].series[0].data).toEqual([5,7]);
  mounted.dispose();expect(chart.dispose).toHaveBeenCalledOnce();
 });
 it('replaces removed series and chart types without leaving old plotted data',()=>{
  const mounted=mountFiftyOneChart(element);
  mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[5]},{name:'UV',values:[3]}]});
  mounted.update({kind:'bar',labels:['10:00'],series:[{name:'PV',values:[0]}]});
  const [options,replace]=chart.setOption.mock.lastCall!;
  expect(replace).toEqual({notMerge:true});expect(options.series).toHaveLength(1);
  expect(options.series[0]).toMatchObject({type:'bar',data:[0]});expect(options.graphic).toEqual([]);
  mounted.update({kind:'donut',labels:['Desktop'],series:[{name:'Devices',values:[3]}]});
  expect(chart.setOption.mock.lastCall?.[0].series[0]).toMatchObject({type:'pie',data:[{name:'Desktop',value:3}]});
  expect(chart.init).toHaveBeenCalledOnce();mounted.dispose();
 });
 it('updates the theme with current data and preserves explicit legend selection',()=>{
  const mounted=mountFiftyOneChart(element);
  mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[5]}]});
  chart.getOption.mockReturnValue({legend:[{selected:{PV:false,Obsolete:false}}]});
  foreground='#eeeeee';theme();
  expect(chart.setOption.mock.lastCall?.[0].tooltip.textStyle.color).toBe('#eeeeee');
  expect(chart.setOption.mock.lastCall?.[0].legend.selected).toEqual({PV:false});
  expect(chart.setOption.mock.lastCall?.[0].series[0].data).toEqual([5]);
  resize();expect(chart.resize).toHaveBeenCalledOnce();expect(chart.init).toHaveBeenCalledOnce();
  mounted.dispose();
 });
 it('disconnects observers once and ignores queued callbacks after unmount',()=>{
  const mounted=mountFiftyOneChart(element);
  mounted.update({kind:'line',labels:['10:00'],series:[{name:'PV',values:[null]}]});
  expect(chart.setOption.mock.lastCall?.[0].graphic).toHaveLength(1);
  mounted.dispose();mounted.dispose();theme();resize();
  mounted.update({kind:'bar',labels:['11:00'],series:[{name:'PV',values:[2]}]});
  expect(resizeDisconnect).toHaveBeenCalledOnce();expect(themeDisconnect).toHaveBeenCalledOnce();
  expect(chart.dispose).toHaveBeenCalledOnce();expect(chart.setOption).toHaveBeenCalledOnce();
  expect(chart.resize).not.toHaveBeenCalled();
 });
});
