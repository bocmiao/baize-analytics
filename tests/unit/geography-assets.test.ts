import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {it, expect} from 'vitest';
import * as echarts from 'echarts';
it('verifies every original map checksum and renders genuine Chinese provinces in current ECharts', async () => {
 const provenance = JSON.parse(await readFile('packages/geography/provenance.json', 'utf8')) as {filesSha256: Record<string, string>; license: string};
 expect(provenance.license).toBe('Apache-2.0');
 for (const [name, expected] of Object.entries(provenance.filesSha256)) expect(createHash('sha256').update(await readFile(`packages/geography/${name}`)).digest('hex')).toBe(expected);
 const china = JSON.parse(await readFile('packages/geography/china.json', 'utf8')); expect(china.features).toHaveLength(34); expect(china.features.some((feature: {properties: {name: string}}) => feature.properties.name === '四川')).toBe(true);
 echarts.registerMap('baize-map-compatibility', china);
 const chart = echarts.init(null, undefined, {renderer: 'svg', ssr: true, width: 800, height: 600});
 try {chart.setOption({series: [{type: 'map', map: 'baize-map-compatibility', label: {show: true}}]}); const svg = chart.renderToSVGString(); expect(svg).toContain('四川'); expect(svg).toContain('<path');} finally {chart.dispose();}
});
