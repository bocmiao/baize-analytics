/** Public share responses must be projected explicitly. Never return arbitrary
 * audience/segment/event dictionaries, which may contain identity dimensions. */
export const embedChartTypes=['top-pages','trend','sources','devices','geography'] as const;
export type EmbedChartType=typeof embedChartTypes[number];
export interface SharedRanking {label:string;pv:number}
export interface SharedReport {
 totals:{pv:number|null;uv:number|null;ips:number|null;sessions:number|null;bounceRate:number|null;averageDuration:number|null};
 trend:{time:string;pv:number|null;uv:number|null;ips:number|null;sessions:number|null}[];
 pages:SharedRanking[];sources:SharedRanking[];devices:SharedRanking[];geography:SharedRanking[];
}
interface ShareStatsInput {
 totals:Record<string,unknown>;
 trend:readonly {time:Date|string;pv:unknown;uv:unknown;ips:unknown;sessions:unknown}[];
 pages:readonly {path:string;pv:number}[];
 sources:readonly {channel:string;pv:number}[];
 audience:Record<string,Record<string,number>>;
}
const count=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
function ranking(rows:SharedRanking[],limit=20):SharedRanking[]{
 const grouped=new Map<string,number>();
 for(const row of rows){const value=count(row.pv);if(value===null)continue;const label=String(row.label||'unknown').slice(0,2048);grouped.set(label,(grouped.get(label)??0)+value);}
 return [...grouped].map(([label,pv])=>({label,pv})).sort((a,b)=>b.pv-a.pv||a.label.localeCompare(b.label)).slice(0,limit);
}
export function projectSharedReport(stats:ShareStatsInput):SharedReport{
 const total=stats.totals;
 return {
  totals:{pv:count(total.pv),uv:count(total.uv),ips:count(total.ips),sessions:count(total.sessions),bounceRate:count(total.bounceRate),averageDuration:count(total.averageDuration)},
  trend:stats.trend.map(row=>({time:new Date(row.time).toISOString(),pv:count(row.pv),uv:count(row.uv),ips:count(row.ips),sessions:count(row.sessions)})),
  pages:ranking(stats.pages.map(row=>({label:row.path.split(/[?#]/,1)[0]||'/',pv:row.pv}))),
  sources:ranking(stats.sources.map(row=>({label:row.channel,pv:row.pv}))),
  devices:ranking(Object.entries(stats.audience.device??{}).map(([label,pv])=>({label,pv}))),
  geography:ranking(Object.entries(stats.audience.country??{}).map(([label,pv])=>({label,pv})))
 };
}
const escapeHtml=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const displayCount=(value:number|null)=>value===null?'—':String(value);
export function renderSharedEmbed(input:{report:SharedReport;type:EmbedChartType;language:'zh-CN'|'en';nonce:string;timezone:string;rangeStatus:string;coverage:number}):string{
 const {report,type,language,nonce}=input,english=language==='en';
 const titles:Record<EmbedChartType,string>=english?{'top-pages':'Top pages (last 30 days)',trend:'Traffic trend (last 30 days)',sources:'Traffic sources (last 30 days)',devices:'Devices (last 30 days)',geography:'Countries and regions (last 30 days)'}:{'top-pages':'热门页面（最近30天）',trend:'流量趋势（最近30天）',sources:'流量来源（最近30天）',devices:'设备分布（最近30天）',geography:'国家与地区（最近30天）'};
 const heading=english?{label:type==='top-pages'?'Page':type==='sources'?'Source':type==='devices'?'Device':'Country / region',pv:'Page views'}:{label:type==='top-pages'?'页面':type==='sources'?'来源':type==='devices'?'设备':'国家 / 地区',pv:'浏览量'};
 const labels:Record<string,string>=english?{}:{direct:'直接访问',search:'搜索引擎',social:'社交媒体',referral:'外部引荐',ai:'AI 引荐',campaign:'推广渠道',email:'邮件',desktop:'电脑',mobile:'手机',tablet:'平板',unknown:'未知'};
 let content='';
 if(type==='trend'){
  const data=report.trend,max=Math.max(1,...data.map(row=>row.pv??0));
  const points=data.map((row,index)=>`${24+(data.length===1?0:index/(data.length-1)*852)},${176-(row.pv??0)/max*150}`).join(' ');
  const date=(value:string)=>new Intl.DateTimeFormat(language,{timeZone:input.timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  content=data.length?`<svg viewBox="0 0 900 200" role="img" aria-label="${english?'Hourly page views':'逐小时浏览量'}"><path d="M24 24V176H876" stroke="var(--border)" fill="none"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2"/>${data.length===1?`<circle cx="24" cy="${176-(data[0]!.pv??0)/max*150}" r="4" fill="var(--accent)"/>`:''}</svg><p>${escapeHtml(date(data[0]!.time))} — ${escapeHtml(date(data.at(-1)!.time))} · ${escapeHtml(input.timezone)}</p><details><summary>${english?'Hourly data':'逐小时明细'}</summary><div class="table-wrap"><table><thead><tr><th>${english?'Time':'时间'}</th><th>${heading.pv}</th><th>${english?'Visitors':'访客数'}</th><th>IP</th><th>${english?'Sessions':'访问次数'}</th></tr></thead><tbody>${data.map(row=>`<tr><td>${escapeHtml(date(row.time))}</td><td>${displayCount(row.pv)}</td><td>${displayCount(row.uv)}</td><td>${displayCount(row.ips)}</td><td>${displayCount(row.sessions)}</td></tr>`).join('')}</tbody></table></div></details>`:'';
 }else{
  const data=report[type==='top-pages'?'pages':type],max=Math.max(1,...data.map(row=>row.pv));
  content=data.length?`<div class="table-wrap"><table><thead><tr><th>${heading.label}</th><th>${heading.pv}</th><th>${english?'Relative volume':'相对流量'}</th></tr></thead><tbody>${data.map(row=>`<tr><td>${escapeHtml(labels[row.label]??row.label)}</td><td>${row.pv}</td><td><progress max="${max}" value="${row.pv}" aria-label="${row.pv}"></progress></td></tr>`).join('')}</tbody></table></div>`:'';
 }
 const warning=input.rangeStatus!=='complete'||input.coverage<1?`<p role="status">${english?'Some data is unavailable or still being aggregated; values are partial.':'部分数据尚未聚合或不可用，当前显示可用部分。'} ${Math.round(Math.max(0,Math.min(1,input.coverage))*100)}%</p>`:'';

 return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titles[type])}</title><style nonce="${escapeHtml(nonce)}">:root{--surface:#fff;--fg:#17243b;--muted:#59677e;--border:#e6ebf2;--accent:#2563eb;color-scheme:light}@media(prefers-color-scheme:dark){:root{--surface:#172235;--fg:#e7edf7;--muted:#a8b7cd;--border:#2b3a52;--accent:#82adff;color-scheme:dark}}*{box-sizing:border-box}body{font:14px system-ui,sans-serif;background:var(--surface);color:var(--fg);margin:0;padding:20px}h2{font-size:18px;margin:0 0 18px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}th{color:var(--muted);font-weight:500}th:first-child{width:52%}progress{width:100%;accent-color:var(--accent);height:9px}svg{display:block;width:100%;max-height:240px}p{line-height:1.6;color:var(--muted)}details{margin-top:16px}summary{cursor:pointer;min-height:44px;display:flex;align-items:center}:focus-visible{outline:2px solid var(--accent);outline-offset:3px}td{font-variant-numeric:tabular-nums}.table-wrap{overflow:auto}small{display:block;color:var(--muted);margin-top:20px}@media(max-width:420px){body{padding:12px}th,td{padding:7px}th:first-child{width:45%}}</style></head><body><h2>${titles[type]}</h2>${warning}${content||`<p>${english?'No visit data':'暂无访问数据'}</p>`}</body></html>`;
}
