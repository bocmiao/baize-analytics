import {reportFilterKeys,type ReportFilters} from '../../packages/contracts/report-definition';
export const navigationGroups=[
 {id:'traffic',zh:'流量分析',en:'Traffic',reports:['trend','periods']},
 {id:'sources',zh:'来路分析',en:'Sources',reports:['sources','sourceSummary','searchEngines','referrals','keywords']},
 {id:'content',zh:'内容分析',en:'Content',reports:['pages','entryPages','directories','domains','downloads','notFound']},
 {id:'attraction',zh:'吸引力分析',en:'Engagement',reports:['visitors','engagement','retention']},
 {id:'audience',zh:'访问者信息',en:'Audience',reports:['environment','environmentDetails','geography','providers','ips','audience']},
 {id:'campaign',zh:'渠道追踪',en:'Campaigns',reports:['campaigns','channelSettings']},
 {id:'experience',zh:'热图与体验',en:'Experience',reports:['heatmap','replay','vitals']},
 {id:'behavior',zh:'用户行为分析',en:'Behavior',reports:['events','eventTrend','paths','userpaths','goals','funnels','revenue','experiments']},
 {id:'bots',zh:'蜘蛛统计',en:'Bots',reports:['bots']},
 {id:'search',zh:'搜索与优化',en:'Search',reports:['seo','gsc','seo-conversions','serp','suggestions']},
 {id:'reports',zh:'AI 与报表',en:'AI and reporting',reports:['ai','reports','alerts','schedules']},
 {id:'settings',zh:'配置与管理',en:'Settings',reports:['settings','eventManagement','ipRules','exports','ga4','shares','members','tokens','audit','jobs','privacy','channels','updates']}
] as const;
export const workspaceReports=['sites','overview','realtime','visits',...navigationGroups.flatMap(group=>group.reports)] as readonly string[];
export interface WorkspaceRoute {siteId:string;report:string;from:string;to:string;filters:ReportFilters;notice?:'invalid-context'}
export function validCivilDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(`${value}T12:00:00Z`);return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;}
export function cleanFilters(value:Record<string,unknown>):ReportFilters{return Object.fromEntries(reportFilterKeys.flatMap(key=>{const v=Object.hasOwn(value,key)?value[key]:undefined,max=key==='path'?1024:key==='channel'?100:500;return typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)&&v.trim()?[[key,v.trim()]]:[];}));}
/** Only site/report/civil dates and the seven existing analysis filters enter URLs. */
export function readWorkspaceRoute(search:string):WorkspaceRoute{const params=new URLSearchParams(search);const site=params.get('site')||'',report=params.get('report')||'sites',from=params.get('from')||'',to=params.get('to')||'';let invalid=false;const safeSite=/^[a-zA-Z0-9_-]{1,128}$/.test(site)?site:'';if(site&&!safeSite)invalid=true;const safeReport=workspaceReports.includes(report)?report:'overview';if(safeReport!==report)invalid=true;const safeFrom=validCivilDate(from)?from:'',safeTo=validCivilDate(to)?to:'',reversed=Boolean(safeFrom&&safeTo&&safeFrom>safeTo);if((from&&!safeFrom)||(to&&!safeTo)||reversed)invalid=true;const raw=Object.fromEntries(reportFilterKeys.flatMap(key=>params.has(key)?[[key,params.get(key)]]:[]));const filters=cleanFilters(raw);if(Object.keys(raw).some(key=>!Object.hasOwn(filters,key)&&raw[key]))invalid=true;return {siteId:safeSite,report:safeReport,from:reversed?'':safeFrom,to:reversed?'':safeTo,filters,...invalid?{notice:'invalid-context' as const}:{}};}
export function workspaceUrl(route:WorkspaceRoute){const params=new URLSearchParams();if(route.siteId)params.set('site',route.siteId);params.set('report',workspaceReports.includes(route.report)?route.report:'overview');if(validCivilDate(route.from))params.set('from',route.from);if(validCivilDate(route.to))params.set('to',route.to);const filters=cleanFilters(route.filters);for(const key of reportFilterKeys)if(filters[key])params.set(key,filters[key]!);return `/app?${params}`;}
