import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {it, expect} from 'vitest';
import * as echarts from 'echarts';
import {resizeGeographicChart} from '../../src/web/GeographicMap';
it('verifies every original map checksum and renders genuine Chinese provinces in current ECharts', async () => {
 const provenance = JSON.parse(await readFile('packages/geography/provenance.json', 'utf8')) as {filesSha256: Record<string, string>; license: string};
 expect(provenance.license).toBe('Apache-2.0');
 for (const [name, expected] of Object.entries(provenance.filesSha256)) expect(createHash('sha256').update(await readFile(`packages/geography/${name}`)).digest('hex')).toBe(expected);
 const china = JSON.parse(await readFile('packages/geography/china.json', 'utf8')); expect(china.features).toHaveLength(34); expect(china.features.some((feature: {properties: {name: string}}) => feature.properties.name === '四川')).toBe(true);
 echarts.registerMap('baize-map-compatibility', china);
 const chart = echarts.init(null, undefined, {renderer: 'svg', ssr: true, width: 800, height: 600});
 try {chart.setOption({series: [{type: 'map', map: 'baize-map-compatibility', label: {show: true}}]}); const svg = chart.renderToSVGString(); expect(svg).toContain('四川'); expect(svg).toContain('<path');} finally {chart.dispose();}
});

it('keeps genuine map geometry during explicit resizes and hidden-container notifications', async () => {
 const china=JSON.parse(await readFile('packages/geography/china.json','utf8'));
 echarts.registerMap('baize-map-resize',china);
 const chart=echarts.init(null,undefined,{renderer:'svg',ssr:true,width:600,height:360});
 try {
  chart.setOption({animation:false,series:[{type:'map',map:'baize-map-resize',label:{show:true},data:[]}]});
  for(const [width,height] of [[600,360],[0,0],[Number.NaN,320],[Number.POSITIVE_INFINITY,320],[360,260],[800,420]]){
   expect(()=>resizeGeographicChart(chart,width,height)).not.toThrow();
   const svg=chart.renderToSVGString();expect(svg).toContain('四川');expect(svg).toContain('<path');expect(svg).not.toMatch(/(?:NaN|Infinity)/);
  }
  expect(chart.getWidth()).toBe(800);expect(chart.getHeight()).toBe(420);
 } finally {chart.dispose();}
 expect(()=>resizeGeographicChart(chart,600,360)).not.toThrow();
});
