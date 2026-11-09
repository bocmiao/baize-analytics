export interface ReferenceLink {key:string;zh:string;en:string}
export interface ReferenceNavigationItem {id:string;zh:string;en:string;icon:string;links:ReferenceLink[]}

/** Names and ordering observed in the public 51.LA V6 navigation; keys stay Baize routes. */
export const referenceNavigation:ReferenceNavigationItem[]=[
 {id:'overview',zh:'概况',en:'Overview',icon:'home',links:[{key:'overview',zh:'概况',en:'Overview'}]},
 {id:'realtime',zh:'实时',en:'Realtime',icon:'clock',links:[{key:'realtime',zh:'实时',en:'Realtime'}]},
 {id:'visits',zh:'访问明细',en:'Visit details',icon:'compass',links:[{key:'visits',zh:'访问明细',en:'Visit details'}]},
 {id:'traffic',zh:'流量分析',en:'Traffic analysis',icon:'trend',links:[{key:'trend',zh:'趋势分析',en:'Trends'},{key:'periods',zh:'周月分析',en:'Weekly / monthly'}]},
 {id:'sources',zh:'来路分析',en:'Source analysis',icon:'sources',links:[{key:'sources',zh:'来路概览',en:'Source overview'},{key:'sourceSummary',zh:'来路汇总',en:'Source summary'},{key:'searchEngines',zh:'搜索引擎',en:'Search engines'},{key:'referrals',zh:'外部链接',en:'Referring sites'},{key:'keywords',zh:'关键词',en:'Keywords'}]},
 {id:'content',zh:'内容分析',en:'Content analysis',icon:'content',links:[{key:'pages',zh:'受访页面',en:'Visited pages'},{key:'entryPages',zh:'入口页面',en:'Entry pages'},{key:'directories',zh:'目录分析',en:'Directories'},{key:'domains',zh:'受访域名',en:'Visited domains'}]},
 {id:'attraction',zh:'吸引力分析',en:'Engagement',icon:'pie',links:[{key:'visitors',zh:'新老访客',en:'New / returning visitors'},{key:'engagement',zh:'互动度',en:'Interaction'}]},
 {id:'audience',zh:'访问者信息',en:'Visitor information',icon:'visitor',links:[{key:'environment',zh:'系统环境',en:'System environment'},{key:'environmentDetails',zh:'环境详情',en:'Environment details'},{key:'geography',zh:'地域分布',en:'Geography'},{key:'providers',zh:'运营商',en:'Network providers'},{key:'ips',zh:'访问IP',en:'Visitor IPs'}]},
 {id:'campaigns',zh:'渠道追踪',en:'Campaign tracking',icon:'channels',links:[{key:'campaigns',zh:'渠道分析',en:'Campaign analysis'},{key:'channelSettings',zh:'渠道设置',en:'Campaign settings'}]},
 {id:'heatmap',zh:'热力图',en:'Heatmaps',icon:'heatmap',links:[{key:'heatmap',zh:'热力图',en:'Heatmaps'}]},
 {id:'replay',zh:'屏幕录制',en:'Screen recordings',icon:'replay',links:[{key:'replay',zh:'屏幕录制',en:'Screen recordings'}]},
 {id:'behavior',zh:'用户行为分析',en:'User behavior',icon:'behavior',links:[{key:'events',zh:'事件分析',en:'Event analysis'}]},
 {id:'bots',zh:'蜘蛛统计',en:'Crawler statistics',icon:'bot',links:[{key:'bots',zh:'蜘蛛统计',en:'Crawler statistics'}]},
 {id:'configuration',zh:'配置',en:'Configuration',icon:'settings',links:[{key:'settings',zh:'参数设置',en:'Parameters'},{key:'eventManagement',zh:'事件管理',en:'Event management'},{key:'ipRules',zh:'IP过滤',en:'IP filtering'},{key:'exports',zh:'数据下载',en:'Data export'}]},
];
export const referenceGroupIsExpandable=(id:string)=>['traffic','sources','content','attraction','audience','campaigns','behavior','configuration'].includes(id);
