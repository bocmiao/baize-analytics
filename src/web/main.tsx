import {standardProfile,parseProfile,supportsReport,LiteConsent,LiteGoalEditor,LiteManualSeo,LiteManualAi,type ProductProfile} from './profile';
import {createPortal} from 'react-dom';
import {GscCoverageView} from './GscCoverageView';
import {SeoRecheckView} from './SeoEvidenceView';
import {IntakeStatus} from './IntakeStatus';
import {BotReasons} from './BotReasons';
import {SelfHostDiagnostics} from './SelfHostDiagnostics';
import {Annotations} from './Annotations';
import type {SiteAnnotation} from '../../packages/contracts/operations-observations';
import {AnalysisState} from './AnalysisState';
import {OverviewDashboard} from './OverviewDashboard';
import {WorkspaceNavigation} from './WorkspaceNavigation';
import {useWorkspaceRoute} from './useWorkspaceRoute';
import {readWorkspaceRoute,workspaceUrl,validCivilDate} from './workspaceRoute';
import InstallationSnippet from './InstallationSnippet';
import {SavedReport,type SavedReportRecord} from './SavedReport';
import {MemberRoleEditor} from './MemberRoleEditor';
import {reportFilterKeys} from '../../packages/contracts/report-definition';
import {storageSourceLabel} from './StorageEvidence';
import {ManualSearchImport} from './ManualSearchImport';
import {Ga4History} from './Ga4History';
import {ownValue} from './dictionary';
import {localizedErrorCode} from './errorMessages';
import {ExperimentResults} from './ExperimentResults';
import {RevenueView, IdentityView} from './RevenueIdentityViews';
import { GeographyExplorer } from './GeographyExplorer';
import { SiteMetadata } from './SiteMetadata';
import { SeoScans } from './SeoScans';
import { SourceSettings } from './SourceSettings';
import { ContentAnalysis, AdvancedGoalAnalysis } from './ExtendedAnalysis';
import { DashboardFilters, filterQuery } from './DashboardFilters';
import { GeoIpSettings } from './GeoIpSettings';
import {suggestionTransitions,suggestionStatusSchema} from '../../packages/contracts/index';
import {NotificationChannel,ReportSchedule,TokenEditor,AlertEditor,ExportEditor} from './GovernanceForms';
import { t, language, changeLanguage } from './i18n';
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { api, rows, type Row, type Site } from './api';
import './style.css';
import { dateRange, civilDate, inclusiveEnd, previousDateRange } from './time';
import { RealtimeSummary } from './RealtimeSummary';
import { SegmentExplorer, EventProperties, Heatmap, CohortTable, VitalsTable } from './AnalysisDetails';
import { ModelSettings, GoogleSettings, GoalEditor, FunnelEditor, ShareEditor, InviteEditor, PrivacyFeatures, RankSettings, AskAnalytics } from './Connectors';
const ReplayViewer = lazy(() => import('./ReplayViewer'));
const HistoryChart=lazy(()=>import('./Charts').then(module=>({default:module.HistoryChart})));
const Visualization = lazy(() => import('./Charts'));
const labels: Record<string, string> = { pv: t('浏览量'), uv: t('访客'), sessions: t('会话'), bounceRate: t('跳出率'), averageDuration: t('平均时长秒数'), visibleSeconds: t('可见秒数'), sampleCount: t('样本数'), time: t('时间'), completionRate: t('读完率'), entries: t('入口'), exits: t('出口'), bounce_rate: t('跳出率'), avg_dwell_s: t('平均可见秒数'), revenue: t('自述收入'), path: t('页面'), name: t('名称'), error:t('任务错误'), event_name: t('事件'), visitors: t('访客'), count: t('次数'), country: t('国家'), region:t('区域'),screen:t('屏幕分辨率'),language:t('访问语言'),keyword:t('搜索词'), city: t('城市'), device: t('设备'), browser: t('浏览器'), os: t('系统'), channel: t('渠道'), referrer: t('来源'), date: t('日期'), day: t('日期'), hour: t('小时'), conversions: t('转化'), rate: t('转化率'), returned: t('回访人数'), cohort_size: t('同期群人数'), metric: t('指标'), p75: 'p75', p90: 'p90', sample_count: t('样本数'), created_at: t('创建时间'), action: t('操作'), role: t('角色'), email: t('邮箱'), status: t('状态'), title: t('标题'), clicks: t('点击'), impressions: t('展示'), position: t('排名'), query: t('搜索词'), coverage: t('覆盖率') };
function readable(v: unknown): string { if (v === null || v === undefined)
    return '—'; if (typeof v === 'object')
    return JSON.stringify(v); return String(v); }
function Table({ data }: {
    data: Row[];
}) { if (!data.length)
    return <p className="empty">{language()==='en'?'No records were returned for this view and range.':'当前视图与范围没有返回记录。'}</p>; const keys = [...new Set(data.flatMap(row => Object.keys(row)))].filter(k => !['site_id', 'token_hash', 'password_hash'].includes(k)); return <div className="table-wrap" tabIndex={0} role="region" aria-label={language()==='en'?'Scrollable data table':'可滚动数据表'}><table><thead><tr>{keys.map(k => <th key={k} scope="col">{ownValue(labels,k) || k}</th>)}</tr></thead><tbody>{data.map((r, i) => <tr key={i}>{keys.map(k => <td key={k}>{k==='uv'&&r[k]===null?t('该模式不支持'):['error','last_error'].includes(k)&&r[k]?localizedErrorCode(r[k]):readable(r[k])}</td>)}</tr>)}</tbody></table></div>; }
function Chart({ data }: {
    data: Row[];
}) { return <Suspense fallback={<p>{t("正在加载图表…")}</p>}><Visualization data={data}/></Suspense>; }
function PathChart({ data }: {
    data: Row[];
}) { return <Suspense fallback={<p>{t("正在加载图表…")}</p>}><Visualization data={data} paths/></Suspense>; }
function LanguagePicker() { return <label className="language">{t("语言 / Language")}<select aria-label={t("界面语言 / Interface language")} defaultValue={language()} onChange={e => changeLanguage(e.target.value)}><option value="zh-CN">{t("简体中文")}</option><option value="en">English</option></select></label>; }
function Landing() { return <div className="landing"><header><a className="brand" href="/">{t("白泽")}<small>BAIZE</small></a><nav><LanguagePicker /><a href="#features">{t("功能")}</a><a href="/login">{t("登录")}</a><a className="button" href="/setup">{t("开始使用")}</a></nav></header><main><p className="eyebrow">{t("数据留在你自己的服务器")}</p><h1>{t("看懂每一次访问，")}<br />{t("找到下一步增长。")}</h1><p className="lead">{t("中文优先、隐私优先的网站分析。")}<br />{t("从流量与行为，到搜索优化和有证据的建议。")}</p><div className="actions"><a className="button" href="/setup">{t("设置我的白泽")}</a><a className="secondary" href="/app">{t("打开看板 →")}</a></div><section className="feature-grid" id="features">{[['流量与行为', '页面、来源、事件、漏斗和留存，统一口径与可见数据水位。'], ['隐私由你掌控', '稳定标识或每日盐模式。最小化采集，支持同意、删除与审计。'], ['从证据到行动', 'SEO 健康检查、BYOK 问数与建议复检，清楚呈现事实与边界。']].map(([title, description]) => <article key={title}><h2>{t(title)}</h2><p>{t(description)}</p></article>)}</section><section className="steps"><h2>{t("三步开始，看见真实数据")}</h2><p>{t("01 创建管理员　→　02 添加站点　→　03 安装追踪代码")}</p></section></main><footer>{t("永久免费自托管 · 主体 AGPLv3 · 追踪脚本 MIT")}</footer></div>; }
function Auth({ setup = false }: {
    setup?: boolean;
}) {
    const [step, setStep] = useState(1);
    const [sso, setSso] = useState(false);
    const [site, setSite] = useState<Site>();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (setup)
        api<{
            required: boolean;
        }>('/api/setup').then(r => { if (!r.required)
            location.href = '/app'; }).catch(e => setError(e.message)); }, [setup]);
    useEffect(() => { if (!setup)
        void api<{
            wecom: boolean;
        }>('/api/sso').then(r => setSso(r.wecom)).catch(() => { }); }, [setup]);
    async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); const fields = Object.fromEntries(new FormData(e.currentTarget)); try {
        if (step === 1) {
            await api(setup ? '/api/setup' : '/api/login', fields);
            if (setup)
                setStep(2);
            else
                location.href = '/app';
        }
        else {
            const r = await api<Site | {
                site: Site;
            }>('/api/v1/sites', { ...fields, tags: String(fields.tags||'').split(',').map(value=>value.trim()).filter(Boolean) });
            setSite('site' in r ? r.site : r);
            setStep(3);
        }
    }
    catch (err) {
        setError((err as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="auth"><a href="/" className="brand">{t("白泽")}<small>BAIZE</small></a><section className="panel"><p className="eyebrow">{setup ? `${t('首次设置')} · ${step}/3` : t('欢迎回来')}</p><h1>{step === 1 ? (setup ? t('创建管理员') : t('登录白泽')) : step === 2 ? t('添加第一个站点') : t('安装追踪代码')}</h1>{error && <p role="alert" className="error">{error}</p>}{step < 3 ? <form onSubmit={submit}>{step === 1 ? <>{setup && <label>{t("姓名")}<input required name="name" autoComplete="name"/></label>}<label>{t("邮箱")}<input required name="email" type="email" autoComplete="username"/></label><label>{t("密码")}<input required name="password" type="password" minLength={setup ? 12 : 1} autoComplete={setup ? 'new-password' : 'current-password'}/></label>{setup && <small>{t("使用至少 12 位的独立密码。")}</small>}</> : <SiteFields />}{!setup && sso && <button type="button" className="secondary" onClick={() => void api<{
        url: string;
    }>('/api/sso/wecom/start').then(r => location.href = r.url).catch(e => setError(e.message))}>{t("企业微信扫码登录")}</button>}<button disabled={busy}>{busy ? t('正在保存…') : step === 1 ? (setup ? t('创建管理员') : t('登录')) : t('创建站点')}</button></form> : <><Snippet site={site!}/><a className="button" href="/app">{t("进入看板")}</a></>}</section></div>;
}
function SiteFields() { return <><label>{t("站点名称")}<input name="name" required placeholder={t("我的网站")}/></label><label>{t("域名")}<input name="domain" required placeholder="example.com"/></label><label>{t("时区")}<select name="timezone" defaultValue="Asia/Shanghai"><option>Asia/Shanghai</option><option>UTC</option><option>America/Los_Angeles</option></select></label><label>{t("访客标识模式")}<select name="privacy_mode"><option value="standard">{t("标准模式 · 支持跨日去重与留存")}</option><option value="daily_salt">{t("每日盐隐私模式 · 不支持跨日去重与留存")}</option></select></label><label>{t('分组标签（逗号分隔，最多 20 个）')}<input name="tags"/></label></>; }
function Snippet({site}:{site:Site}) { return <InstallationSnippet site={site} language={language()==='en'?'en':'zh-CN'}/>; }
const tabs = [['overview', t('总览')], ['revenue', t('收入归因')], ['realtime', t('实时')], ['pages', t('页面')], ['sources', t('来源')], ['audience', t('受众')], ['events', t('事件')], ['downloads',t('文件下载')], ['notFound',t('404 修复清单')], ['eventTrend',t('事件趋势')], ['userpaths', t('已识别用户')], ['goals', t('目标')], ['funnels', t('漏斗')], ['retention', t('留存')], ['paths', t('路径')], ['vitals', t('性能')], ['reports', t('报表')], ['shares', t('分享')], ['alerts', t('告警')], ['members', t('成员')], ['tokens', t('API 令牌')], ['audit', t('审计')], ['jobs', t('任务恢复')], ['privacy', t('隐私与数据')], ['exports', t('数据导出')], ['channels', t('通知渠道')], ['schedules', t('推送计划')], ['heatmap', t('热图')], ['replay', t('回放')], ['experiments', t('实验')], ['seo', t('SEO')], ['ai', t('AI')], ['gsc', t('搜索关键词')], ['seo-conversions', t('SEO 转化对照')], ['ga4', t('历史导入')], ['serp', t('排名监控')], ['suggestions', t('建议复检')], ['settings', t('站点设置')]];
function App() {
 const {route,navigate}=useWorkspaceRoute();const {siteId,report:tab,from,to,filters}=route;
 const [profile,setProfile]=useState<ProductProfile>(standardProfile),[profileReady,setProfileReady]=useState(false),[profileError,setProfileError]=useState(''),[profileRetry,setProfileRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();let active=true;setProfileError('');void fetch('/api/capabilities',{signal:controller.signal,credentials:'same-origin'}).then(async response=>{if(response.status===404)return standardProfile;if(!response.ok)throw new Error(`Capability lookup failed: HTTP ${response.status}`);return parseProfile(await response.json());}).then(value=>{if(active){setProfile(value);setProfileReady(true);}}).catch(reason=>{if(active)setProfileError(reason.message);});return()=>{active=false;controller.abort();};},[profileRetry]);
 const [siteTag,setSiteTag]=useState(''),[health,setHealth]=useState<Row>({}),[user,setUser]=useState<Row>({}),[sites,setSites]=useState<Site[]>([]),[error,setError]=useState(''),[adding,setAdding]=useState(false),[refresh,setRefresh]=useState(0),[loadingSites,setLoadingSites]=useState(true);
 function defaultDates(timezone:string){const today=civilDate(new Date().toISOString(),timezone),first=new Date(`${today}T12:00:00Z`);first.setUTCDate(first.getUTCDate()-6);return {from:first.toISOString().slice(0,10),to:today};}
 function selectSite(id:string){const selected=sites.find(value=>value.id===id);if(selected)navigate({siteId:id,...defaultDates(selected.timezone),filters:{},notice:undefined});}
 useEffect(()=>{const controller=new AbortController();let active=true;setError('');void api<Row>('/api/me',undefined,'GET',controller.signal).then(result=>{if(!active)return;setUser(result.user as Row);void api<Row>('/healthz',undefined,'GET',controller.signal).then(result=>{if(active)setHealth(result);}).catch(()=>{});return api('/api/v1/sites',undefined,'GET',controller.signal);}).then(result=>{if(!active||!result)return;const all=rows(result) as Site[];setSites(all);const saved=readWorkspaceRoute(location.search),selected=all.find(value=>value.id===saved.siteId)||all[0];if(selected){const defaults=defaultDates(selected.timezone);navigate({siteId:selected.id,from:saved.from||defaults.from,to:saved.to||defaults.to,...saved.siteId&&!all.some(value=>value.id===saved.siteId)?{notice:'invalid-context' as const}:{}},true);}}).catch(reason=>{if(!active)return;if(/unauth|401/i.test(reason.message))location.href='/login';else setError(reason.message);}).finally(()=>{if(active)setLoadingSites(false);});return()=>{active=false;controller.abort();};},[refresh]);
 useEffect(()=>{if(siteTag&&!sites.find(value=>value.id===siteId)?.tags?.includes(siteTag))setSiteTag('');},[siteId,sites,siteTag]);
 const site=sites.find(value=>value.id===siteId),admin=user.is_admin===true||['owner','admin'].includes(site?.current_role||'');
 const adminTabs=['shares','tokens','members','audit','jobs','privacy','exports','channels','schedules','alerts','settings','seo','suggestions',...(profile.profile==='lite'?['ai']:[])];const visibleTabs=tabs.filter(([key])=>supportsReport(profile,key)&&(admin||!adminTabs.includes(key))),denied=Boolean(site&&!admin&&adminTabs.includes(tab));
 const validRange=validCivilDate(from)&&validCivilDate(to)&&from<=to;
 const internalScope=['overview','pages','sources','audience','events','downloads','notFound','eventTrend','goals','funnels','retention','paths','vitals','revenue','userpaths'].includes(tab);
 return <div className={`workspace workspace-report-${tab}`}><a className="skip-main" href="#workspace-main">{language()==='en'?'Skip to main content':'跳到主要内容'}</a><WorkspaceNavigation route={route} items={visibleTabs} onNavigate={report=>{navigate({report,notice:undefined});setAdding(false);}} account={close=><><LanguagePicker/>{user.is_admin===true&&<button className="secondary" onClick={()=>{setAdding(true);close();}}>{t('＋ 添加站点')}</button>}<button className="secondary" onClick={()=>void api('/api/logout',{}).then(()=>location.href='/')}>{t('退出登录')}</button></>}>{()=> <><a href="/" className="brand" aria-label={language()==='en'?'Baize home':'白泽首页'}><svg className="brand-symbol" width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><path fill="#4F46FF" d="m20 2 15 15-7 7-8-8-8 8-7-7Z"/><path fill="#0B1138" d="m12 19 8 8 8-8 7 7-15 14L5 26Z"/><path fill="#B5BCFF" d="m20 2 7 7-7 7-7-7Z"/></svg><span className="brand-name">{t('白泽')}<small>BAIZE</small></span></a></>}</WorkspaceNavigation><main id="workspace-main" tabIndex={-1}><div className="workspace-toolbar"><select className="toolbar-site-select" aria-label={t('选择站点')} value={siteId} onChange={event=>{selectSite(event.target.value);}}>{sites.filter(value=>!siteTag||value.tags?.includes(siteTag)).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select><div className="date-range"><label>{t('开始')}<input type="date" value={from} max={to||undefined} onChange={event=>navigate({from:event.target.value})}/></label><label>{t('结束')}<input type="date" value={to} min={from||undefined} onChange={event=>navigate({to:event.target.value})}/></label><button onClick={()=>setRefresh(value=>value+1)}>{t('刷新')}</button></div>{tab==='overview'&&<div id="overview-mobile-toolbar-actions"/>}<details className="toolbar-preferences"><summary>{language()==='en'?'Workspace options':'工作空间选项'}</summary><label className="toolbar-group-select">{t('站点分组')}<select value={siteTag} onChange={event=>{setSiteTag(event.target.value);const next=sites.find(value=>!event.target.value||value.tags?.includes(event.target.value));if(next)selectSite(next.id);}}><option value="">{t('全部分组')}</option>{[...new Set(sites.flatMap(value=>value.tags||[]))].map(tag=><option key={tag}>{tag}</option>)}</select></label>{site&&<details className="site-context-details"><summary>{language()==='en'?'Site details':'站点详情'}</summary><p>{site.name} · {site.domain}</p><p>{language()==='en'?'Role':'当前角色'}: {site.current_role||(user.is_admin?'admin':'—')} · {site.timezone}</p></details>}<div id="workspace-interpretation-host"/></details></div><header className="page-header"><h1>{tabs.find(value=>value[0]===tab)?.[1]}</h1>{tab==='overview'&&<div id="overview-toolbar-actions"/>}</header>{site&&<p className="scope-context">{language()==='en'?'Time zone':'日期时区'}: {site.timezone} · {language()==='en'?'Compare: previous equal period':'比较：上一等长区间'}</p>}{route.notice&&<p className="notice" role="status">{language()==='en'?'Some URL context was invalid or unavailable. The supported context has been restored.':'网址中的部分上下文无效或不可访问，已恢复支持的范围。'}</p>}{internalScope&&<><div className="filter-chips" aria-label={language()==='en'?'Active analysis filters':'已应用的分析筛选'}>{Object.entries(filters).filter(([,value])=>value).length?Object.entries(filters).filter(([,value])=>value).map(([key,value])=><button className="secondary" key={key} onClick={()=>{const next={...filters};delete next[key as keyof typeof next];navigate({filters:next});}} aria-label={`${language()==='en'?'Remove filter':'移除筛选'} ${key}: ${value}`}>{key}: {value} <span aria-hidden="true">×</span></button>):null}{Object.keys(filters).length>0&&<button className="secondary" onClick={()=>navigate({filters:{}})}>{language()==='en'?'Clear all active filters':'清除所有已应用筛选'}</button>}</div><DashboardFilters value={filters as Row} onApply={value=>navigate({filters:value})}/></>}{!internalScope&&Object.keys(filters).length>0&&<p className="scope-context">{language()==='en'?'Onsite filters remain in the URL, but do not apply to this view.':'站内筛选保留在网址中，但不应用于当前视图。'}</p>}{health.geoip==='unknown'&&['audience','settings'].includes(tab)&&<p className="scope-context" role="status">{language()==='en'?'Geography is unknown until a region database is configured. Locations are not guessed and raw IP addresses are not sent externally.':'地域库未配置，地域显示未知；不会推测地域或外发原始 IP。'}{user.is_admin===true&&profile.profile==='standard'&&<> · <a href={workspaceUrl({...route,report:'settings'})} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({report:'settings'});}}>{language()==='en'?'Configure region database':'配置地域库'}</a></>}</p>}{error&&<p className="error" role="alert">{error}</p>}{adding?<section className="panel"><h2>{t('添加站点')}</h2><form onSubmit={event=>{event.preventDefault();const fields=Object.fromEntries(new FormData(event.currentTarget));void api<{site:Site}>('/api/v1/sites',{...fields,tags:String(fields.tags||'').split(',').map(value=>value.trim()).filter(Boolean)}).then(result=>{navigate({siteId:result.site.id,report:'settings',...defaultDates(result.site.timezone),filters:{}});setAdding(false);setRefresh(value=>value+1);}).catch(reason=>setError(reason.message));}}><SiteFields/><button>{t('创建站点')}</button><button type="button" className="secondary" onClick={()=>setAdding(false)}>{t('取消')}</button></form></section>:profileError?<section className="panel"><p role="alert" className="error">{profileError}</p><button onClick={()=>setProfileRetry(value=>value+1)}>{language()==='en'?'Retry capability lookup':'重试功能配置'}</button></section>:loadingSites||!profileReady?<p role="status">{t('正在读取真实数据…')}</p>:!supportsReport(profile,tab)?<section className="panel"><h2>{language()==='en'?'Unavailable in Lite':'Lite 暂不支持此功能'}</h2><p role="status">{language()==='en'?'This deployment profile does not provide this feature. No request to enable it has been made.':'当前部署版本未提供此功能，未执行启用或采集请求。'}</p><a className="button" href={workspaceUrl({...route,report:'overview'})} onClick={event=>{event.preventDefault();navigate({report:'overview'});}}>{language()==='en'?'Back to overview':'返回总览'}</a></section>:denied?<section className="panel"><h2>{language()==='en'?'This view requires a site administrator':'此视图需要站点管理员权限'}</h2><p role="alert">{language()==='en'?'Your current role cannot open these management controls. Server permissions remain enforced for every request.':'当前角色不能打开这些管理操作，所有请求仍由服务器独立验证权限。'}</p><a href={workspaceUrl({...route,report:'overview'})} onClick={event=>{event.preventDefault();navigate({report:'overview'});}}>{language()==='en'?'Back to overview':'返回总览'}</a></section>:site&&!validRange?<p className="notice" role="status">{language()==='en'?'Choose valid dates with the start before or equal to the end.':'请选择有效日期，开始日期不能晚于结束日期。'}</p>:site&&validRange?<View profile={profile} geographyStatus={typeof health.geoip==='string'?health.geoip:undefined} key={`${siteId}-${tab}`} site={site} tab={tab} query={`${dateRange(from,to,site.timezone)}&${filterQuery(filters as Row)}`} refresh={refresh} canWrite={admin||site.current_role==='analyst'} canAdmin={admin} instanceAdmin={user.is_admin===true} onReport={report=>navigate({report})} onFilter={(key,value)=>navigate({filters:{...filters,[key]:value}})} reportHref={report=>workspaceUrl({...route,report})} filterHref={(key,value)=>workspaceUrl({...route,filters:{...filters,[key]:value}})}/>:<section className="panel"><h2>{t('添加站点，开始收集真实访问')}</h2><p>{t('这里没有演示数据。创建站点并安装追踪代码后，数据会出现在看板。')}</p>{user.is_admin===true&&<button onClick={()=>setAdding(true)}>{t('添加第一个站点')}</button>}</section>}</main></div>;
}
function View({ profile, site, tab, query, refresh, canWrite, canAdmin,instanceAdmin,geographyStatus,onReport,onFilter,reportHref,filterHref }: {
    profile:ProductProfile;
    site: Site;
    tab: string;
    query: string;
    refresh: number;
    canWrite: boolean;canAdmin:boolean;instanceAdmin:boolean;geographyStatus?:string;onReport:(report:string)=>void;onFilter:(key:'path'|'channel',value:string)=>void;reportHref:(report:string)=>string;filterHref:(key:'path'|'channel',value:string)=>string;
}) {
    const [data, setData] = useState<Row>({});
    const [annotations,setAnnotations]=useState<SiteAnnotation[]>([]),[selectedAnnotation,setSelectedAnnotation]=useState('');useEffect(()=>{setAnnotations([]);setSelectedAnnotation('');},[site.id,query]);
    const [analysis, setAnalysis] = useState<Row>({});
    const [analysisError,setAnalysisError]=useState('');
    const [analysisLoading,setAnalysisLoading]=useState(false);
    const [analysisRetry,setAnalysisRetry]=useState(0);
    const [previous, setPrevious] = useState<Row>({});
    const [overviewDefinitions,setOverviewDefinitions]=useState<{goals:Row[];funnels:Row[]}>({goals:[],funnels:[]});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);
    const [registrationEvent,setRegistrationEvent]=useState('signup');
    const base = `/api/v1/sites/${site.id}`;
    const endpoint = ['overview', 'pages', 'sources', 'audience', 'events', 'retention', 'paths', 'vitals'].includes(tab) ? 'stats' : ['downloads','notFound','eventTrend'].includes(tab)?'content':tab === 'privacy' ? 'usage' : tab === 'settings' ? 'usage' : tab === 'userpaths' ? 'identities' : tab;
    const requestPath = ['seo', 'ai', 'gsc', 'ga4', 'serp', 'suggestions', 'seo-conversions'].includes(tab) ? `/api/sites/${site.id}/${tab === 'seo' ? 'seo/scans' : tab === 'ai' ? 'ai/usage' : tab === 'seo-conversions' ? 'seo/conversions' : tab}${['gsc', 'ga4', 'seo-conversions'].includes(tab) ? `?start=${civilDate(new URLSearchParams(query).get('from')!, site.timezone)}&end=${inclusiveEnd(new URLSearchParams(query).get('to')!, site.timezone)}` : ''}` : `${base}/${endpoint}?${query}${endpoint==='identities'?`&registrationEvent=${encodeURIComponent(registrationEvent)}`:''}`;
    useEffect(() => {
        if(tab==='realtime'||profile.profile==='lite'&&['seo','ai'].includes(tab))return;
        const controller = new AbortController(); let active = true;
        setLoading(true); setError(''); setData({});
        void api<Row>(requestPath, undefined, 'GET', controller.signal).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [requestPath, refresh, version,profile,tab]);
    const pendingExports = tab === 'exports' && !error && rows(data).some(row=>['pending','running'].includes(String(row.status)));
    const pendingAggregation = endpoint === 'stats' && data.coverage !== undefined && Number(data.coverage) < 1 && !['partial_unavailable','future_only'].includes(String(data.rangeStatus));
    useEffect(() => {
        if (!pendingAggregation && !pendingExports) return;
        const controller = new AbortController(); let active = true, busy = false;
        const timer = setInterval(() => {
            if (busy || document.visibilityState === 'hidden') return;
            busy = true;
            void api<Row>(requestPath, undefined, 'GET', controller.signal).then(result => { if (active) { setData(result); setError(''); } }).catch(e => { if (active) {setData({});setError(e.message);} }).finally(() => { busy = false; });
        }, 2000);
        return () => { active = false; controller.abort(); clearInterval(timer); };
    }, [requestPath, pendingAggregation, pendingExports, refresh, version]);
    useEffect(() => {
        if (!['goals', 'funnels'].includes(tab)) return;
        const controller = new AbortController(); let active = true; setAnalysis({});setAnalysisError('');setAnalysisLoading(true);
        void api<Row>(`${base}/analysis?${query}`, undefined, 'GET', controller.signal).then(result => { if (active) setAnalysis(result); }).catch(e => { if (active) {setAnalysis({});setAnalysisError(e.message);} }).finally(()=>{if(active)setAnalysisLoading(false);});
        return () => { active = false; controller.abort(); };
    }, [base, tab, query, version, refresh, analysisRetry]);
    useEffect(()=>{
        setOverviewDefinitions({goals:[],funnels:[]});
        if(tab!=='overview')return;
        const controller=new AbortController();let active=true;
        void Promise.allSettled([api<Row>(`${base}/goals`,undefined,'GET',controller.signal),supportsReport(profile,'funnels')?api<Row>(`${base}/funnels`,undefined,'GET',controller.signal):Promise.resolve({})]).then(([goals,funnels])=>{if(active)setOverviewDefinitions({goals:goals.status==='fulfilled'?rows(goals.value):[],funnels:funnels.status==='fulfilled'?rows(funnels.value):[]});});
        return()=>{active=false;controller.abort();};
    },[base,tab,refresh,version,profile]);
    useEffect(() => {
        if (tab !== 'overview') return;
        const controller = new AbortController(); let active = true; setPrevious({});
        const q = previousDateRange(query,site.timezone);
        void api<Row>(`${base}/stats?${q}`, undefined, 'GET', controller.signal).then(result => { if (active) setPrevious(result); }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; controller.abort(); };
    }, [base, tab, query, version, refresh, site.timezone, data.coverage]);
    useEffect(() => {
        if (tab !== 'realtime'||!supportsReport(profile,'realtime')) return;
        let active=true,generation=0,busy=false,queued=false;
        let controller:AbortController|undefined,stream:EventSource|undefined;
        let timer:ReturnType<typeof setInterval>|undefined,onlineTimer:ReturnType<typeof setTimeout>|undefined;
        setData({});setError('');setLoading(true);
        const visible=()=>active&&document.visibilityState!=='hidden';
        const refreshLive=()=>{
            if(!visible())return;
            if(busy){queued=true;return;}
            busy=true;queued=false;const scope=generation;const request=new AbortController();controller=request;
            void api<Row>(`${base}/realtime`,undefined,'GET',request.signal).then(result=>{
                if(active&&scope===generation&&!request.signal.aborted){setData(result);setError('');}
            }).catch(error=>{if(active&&scope===generation&&!request.signal.aborted)setError(error.message);}).finally(()=>{
                if(scope!==generation)return;
                busy=false;controller=undefined;if(active)setLoading(false);
                if(queued&&visible())refreshLive();
            });
        };
        const pause=()=>{
            generation++;controller?.abort();controller=undefined;busy=false;queued=false;
            stream?.close();stream=undefined;clearInterval(timer);timer=undefined;clearTimeout(onlineTimer);onlineTimer=undefined;
        };
        const resume=()=>{
            if(!visible()||stream)return;
            stream=new EventSource(`${base}/realtime/stream`);
            stream.onmessage=message=>{
                if(!visible())return;
                let event:Row;try{event=JSON.parse(message.data) as Row;}catch{return;}
                if(!onlineTimer)onlineTimer=setTimeout(()=>{onlineTimer=undefined;refreshLive();},500);
                // A snapshot already in flight predates this event; read again after it settles.
                if(busy)queued=true;
                setData(current=>({...current,events:[event,...rows(current.events).filter(e=>e.event_id!==event.event_id)].slice(0,200)}));
            };
            refreshLive();timer=setInterval(refreshLive,30000);
        };
        const changed=()=>{if(document.visibilityState==='hidden')pause();else resume();};
        document.addEventListener('visibilitychange',changed);resume();
        return()=>{active=false;pause();document.removeEventListener('visibilitychange',changed);};
    }, [base, tab,refresh,version,profile]);
    if(profile.profile==='lite'&&tab==='seo')return <LiteManualSeo key={`${site.id}-${query}`} site={site} query={query}/>;
    if(profile.profile==='lite'&&tab==='ai')return <LiteManualAi key={`${site.id}-${query}`} site={site} query={query}/>;
    if (['downloads','notFound','eventTrend'].includes(tab)) return <ContentAnalysis siteId={site.id} query={query} kind={tab as 'downloads'|'notFound'|'eventTrend'}/>;
    if(tab==='settings'&&profile.profile==='lite')return <section className="panel"><h2>{t('追踪代码与站点信息')}</h2><SiteMetadata site={site} onSaved={()=>setVersion(n=>n+1)}/><Snippet site={site}/><LiteConsent site={site} onSaved={()=>setVersion(n=>n+1)}/><Action title="更新保留策略" scopeLabel={`${site.name} (${site.domain})`} currentRetention={site.retention_days} endpoint={`${base}/retention`} method="PATCH" fields={[["days","明细保留天数","number"]]} onSaved={()=>setVersion(n=>n+1)}/></section>;
    if (tab === 'settings')
        return <section className="panel"><h2>{t("追踪代码与站点信息")}</h2><SiteMetadata site={site} onSaved={()=>setVersion(n=>n+1)}/><Snippet site={site}/><p>{t("标识模式：")}{site.privacy_mode === 'daily_salt' ? t('每日盐隐私模式') : t('标准模式')}{t("· 时区：")}{site.timezone}</p><Action title="更新保留策略" scopeLabel={`${site.name} (${site.domain})`} currentRetention={site.retention_days} endpoint={`${base}/retention`} method="PATCH" fields={[['days', '明细保留天数', 'number']]} onSaved={() => setVersion(n => n + 1)}/><PrivacyFeatures key={JSON.stringify(site.config)} siteId={site.id} initial={site.config} onSaved={() => setVersion(n => n + 1)}/><SourceSettings siteId={site.id} initial={site.config} onSaved={() => setVersion(n=>n+1)}/>{instanceAdmin&&<GeoIpSettings/>}<SelfHostDiagnostics siteId={site.id} refresh={refresh+version}/>{instanceAdmin&&<details><summary>{language()==='en'?'Instance-wide enterprise SSO settings':'实例级企业 SSO 设置'}</summary><Action title="实例企业微信 SSO（仅实例管理员）" endpoint="/api/admin/sso/wecom" method="PUT" fields={[["corpId", "企业 ID"], ["agentId", "应用 ID"], ["secret", "应用密钥", "password"], ["enabled", "启用 true/false", "json"], ["mappings", "已授权外部成员与本地用户映射 JSON", "json"]]} onSaved={() => setVersion(n => n + 1)}/></details>}</section>;
    if(tab==='ai')return <><AIPanels site={site} query={query} canAdmin={canAdmin} refresh={version} onSaved={()=>setVersion(value=>value+1)}/>{error&&<p className="error" role="alert">{t('请求失败：')}{error}</p>}<details className="panel"><summary>{language()==='en'?'AI usage and call records':'AI 使用与调用记录'}</summary>{loading?<p role="status">{t('正在读取真实数据…')}</p>:!error&&<><Table data={rows(data)}/>{Object.entries(data).filter(([,value])=>Array.isArray(value)).map(([key,value])=><section key={key}><h3>{ownValue(labels,key)||key}</h3><Table data={rows(value)}/></section>)}</>}</details></>;
    const dataView=['overview','pages','sources','audience','events','retention','paths','vitals','realtime','revenue','userpaths','heatmap','replay'].includes(tab);
    if(loading&&dataView)return <section className="panel" aria-busy="true"><p role="status">{t('正在读取真实数据…')}</p></section>;
    if(error&&Object.keys(data).length===0&&dataView)return <section className="panel"><p className="error" role="alert">{t('请求失败：')}{error}</p><button onClick={()=>setVersion(value=>value+1)}>{language()==='en'?'Retry this view':'重试当前视图'}</button></section>;
    return <><QueryHealth data={data} timezone={site.timezone} query={query} compact={tab==='overview'}/>{pendingAggregation && <p role="status" className="notice">{t("聚合任务尚未完成，正在自动更新。")}</p>}{loading && <p role="status">{t("正在读取真实数据…")}</p>}{error && <div><p className="error" role="alert">{t("请求失败：")}{error}</p><button onClick={()=>setVersion(value=>value+1)}>{language()==='en'?'Retry this view':'重试当前视图'}</button></div>}{site.privacy_mode === 'daily_salt' && ['overview', 'retention'].includes(tab) && <p className="notice">{t("每日盐隐私模式不支持跨日访客去重、回访与留存。")}</p>}{tab === 'revenue' ? <RevenueView data={data}/> : tab === 'overview' ? <><AnalysisState data={data} filtered={reportFilterKeys.some(key=>Boolean(new URLSearchParams(query).get(key)))}/><OverviewDashboard geographyStatus={geographyStatus} instanceAdmin={instanceAdmin} site={site} data={data} previous={previous} canAdmin={canAdmin} goalDefinitions={overviewDefinitions.goals} funnelDefinitions={overviewDefinitions.funnels} onReport={onReport} onFilter={onFilter} reportHref={reportHref} filterHref={filterHref} annotations={annotations} selectedAnnotation={selectedAnnotation} onSelectAnnotation={setSelectedAnnotation}/><details className="panel"><summary>{language()==='en'?'Observed intake and filtered-request explanations':'真实接入与过滤请求说明'}</summary><IntakeStatus siteId={site.id} query={query} refresh={refresh+version}/>{profile.profile==='standard'&&((+new Date(new URLSearchParams(query).get('to')!)-+new Date(new URLSearchParams(query).get('from')!))<=31*86400000?<BotReasons siteId={site.id} from={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} to={inclusiveEnd(new URLSearchParams(query).get('to')!,site.timezone)} refresh={refresh+version}/>:<p>{language()==='en'?'Filtered-request observations support at most 31 calendar days; narrow the range.':'过滤请求观测最多支持 31 个日历日，请缩短范围。'}</p>)}</details>{profile.profile==='standard'&&(+new Date(new URLSearchParams(query).get('to')!)-+new Date(new URLSearchParams(query).get('from')!))<=366*86400000&&<details className="panel"><summary>{language()==='en'?'Manual date annotations':'人工日期备注'}</summary><Annotations siteId={site.id} from={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} to={inclusiveEnd(new URLSearchParams(query).get('to')!,site.timezone)} canWrite={canWrite} refresh={refresh+version} onRows={setAnnotations} onLocate={setSelectedAnnotation}/></details>}</> : !loading&&!error?<section className="panel"><h2>{tabs.find(t => t[0] === tab)?.[1]}{t("数据")}</h2>{tab === 'replay' && <Suspense fallback={<p>{t("加载隐私回放播放器…")}</p>}><ReplayViewer chunks={rows(data)}/></Suspense>}{tab === 'paths' && <PathChart data={rows(data.paths)}/>} {data.insight !== undefined && <p className="notice">{factInsight(data)}</p>}{tab === 'funnels' && analysis.funnelStatus === 'unsupported_in_this_mode' && <p className="notice">{t('该模式不支持')}{t("：每日盐不能跨日识别漏斗访客。")}</p>}{tab === 'realtime' && <RealtimeSummary data={data}/>}{['goals', 'funnels'].includes(tab) && <section><h3>{t("选定范围的实际转化与流失")}</h3><Table data={rows(analysis[tab])}/></section>}{tab === 'privacy' && <p>{t("事件数：")}{readable(data.event_count)}{t("· 占用字节：")}{readable(data.bytes)}</p>}{!['seo','audience','retention','jobs','privacy','settings','userpaths','revenue','experiments','replay','heatmap'].includes(tab)&&<Table data={rows(data).length ? rows(data) : rows(data[tab] || (tab==='realtime'?data.events:undefined) || data.scans || data.connections || data.rows)}/>}{tab === 'audience' && Object.entries((data.audience || {}) as Row).filter(([dimension])=>dimension!=='ip_truncated').map(([dimension, values]) => <section key={dimension}><h3>{ownValue(labels,dimension) || dimension}</h3><Table data={Object.entries(values as Row).map(([value, count]) => ({ [dimension]: value, count }))}/></section>)}{tab === 'retention' && <Table data={Object.entries((data.cohorts || {}) as Row).filter(([key]) => key !== 'status').map(([date, value]) => ({ date, ...value as Row }))}/>} {Object.entries(data).filter(([k, v]) => Array.isArray(v) && k !== tab && !['rows', 'data', 'items'].includes(k) && !['pages', 'sources', 'audience', 'events', 'retention', 'paths', 'vitals','realtime','userpaths'].includes(tab)).map(([k, v]) => <section key={k}><h3>{ownValue(labels,k) || k}</h3><Table data={rows(v)}/></section>)}</section>:null}{['goals','funnels'].includes(tab)&&<>{analysisLoading&&<p role="status">{language()==='en'?'Loading conversion analysis…':'正在读取转化分析…'}</p>}{analysisError&&<section className="notice"><p role="alert">{language()==='en'?'Conversion analysis is unavailable; successfully loaded definitions remain visible.':'转化分析暂不可用；已成功读取的定义仍然显示。'} {analysisError}</p><button className="secondary" onClick={()=>setAnalysisRetry(value=>value+1)}>{language()==='en'?'Retry conversion analysis':'重试转化分析'}</button></section>}{!analysisLoading&&!analysisError&&profile.profile==='standard'&&<AdvancedGoalAnalysis siteId={site.id} query={query} goals={rows(analysis.goals)} funnels={rows(analysis.funnels)} kind={tab as 'goals'|'funnels'}/>}</>} {canWrite && ['reports', 'shares', 'tokens', 'members', 'goals', 'funnels'].includes(tab) && rows(data).length > 0 && <section className="panel"><h2>{t("管理记录")}</h2>{rows(data).map(row => <p key={String(row.id)}>{readable(row.name || row.email || row.id)} <button className="secondary" onClick={() => { if (window.confirm(`${t(tab === 'shares' || tab === 'tokens' ? '确定吊销此记录？' : '确定删除此记录？')}\n${site.name} (${site.domain})\n${readable(row.name||row.email||row.id)}`))
        void api(`${base}/${tab}/${row.id}`, undefined, 'DELETE').then(() => setVersion(n => n + 1)).catch(e => setError(e.message)); }}>{tab === 'shares' || tab === 'tokens' ? t('吊销') : t('删除')}</button></p>)}</section>} {tab === 'alerts' && rows(data).length > 0 && <section className="panel"><h2>{t("静默告警")}</h2>{rows(data).map(row => <p key={String(row.id)}>{readable(row.kind)} <button className="secondary" onClick={() => void api(`${base}/alerts/${row.id}/silence`, { hours: 24 }).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("静默 24 小时")}</button></p>)}</section>} {tab === 'exports' && <><ExportEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>{rows(data).filter(r => r.status === 'complete').map(r => <a className="button" key={String(r.id)} href={`${base}/exports/${r.id}`}>{t("下载")}{String(r.id)}</a>)}</>}{tab === 'channels' && <NotificationChannel siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'schedules' && <ReportSchedule siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab==='experiments'&&<ExperimentResults experiments={rows(data)} siteId={site.id} canAdmin={canAdmin} onSaved={()=>setVersion(n=>n+1)}/>} {canWrite && tab === 'experiments' && <ExperimentWorkflow site={site} onSaved={() => setVersion(n => n + 1)}/>} {canWrite && tab === 'goals' && (profile.profile==='lite'?<LiteGoalEditor siteId={site.id} onSaved={()=>setVersion(n=>n+1)}/>:<GoalEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>)} {canWrite && tab === 'funnels' && <FunnelEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'jobs' && <section className="panel"><h2>{t("可靠采集与聚合恢复")}</h2><pre>{JSON.stringify(data, null, 2)}</pre><p>{t("仅管理员可重放死信。重放会使旧租约失效，并从 PostgreSQL 已持久化事件重新处理。")}</p><button onClick={() => void api(`${base}/jobs/replay`, {}).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("重放死信并重新聚合")}</button></section>}{tab === 'reports' && <ReportRunner siteId={site.id} reports={rows(data)}/>} {canWrite && tab === 'reports' && <SavedReport siteId={site.id} from={new URLSearchParams(query).get("from") || ""} to={new URLSearchParams(query).get("to") || ""} filters={Object.fromEntries(reportFilterKeys.flatMap(key=>{const value=new URLSearchParams(query).get(key);return value?[[key,value]]:[];}))} reports={rows(data) as unknown as SavedReportRecord[]} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'shares' && <ShareEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'tokens' && <TokenEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {canAdmin && tab === 'members' && <><MemberRoleEditor siteId={site.id} members={rows(data) as {id:string;email?:string;name?:string;role:string}[]} onSaved={() => setVersion(n => n + 1)}/><InviteEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/></>} {tab === 'alerts' && <AlertEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'privacy' && <><section className="panel"><h2>{t("导出与删除")}</h2><p>{t("删除会生成独立删除记录，并重建可重算聚合。超过明细保留期的历史无法完整重算。")}</p><button onClick={() => void api(`${base}/exports`, { format: 'csv' }).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("创建 CSV 导出任务")}</button></section><Action title={t("永久删除访客数据")} scopeLabel={`${site.name} (${site.domain})`} endpoint={`${base}/delete-visitor`} fields={[['visitor_id', '访客标识'], ['user_id', '已识别用户标识（可选）']]} onSaved={() => setVersion(n => n + 1)}/></>} {tab==='gsc'&&<GscCoverageView data={data}/>} {tab==='ga4'&&<><HistoricalComparison site={site} historical={rows(data.rows)} query={query}/><Ga4History siteId={site.id} start={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} end={inclusiveEnd(new URLSearchParams(query).get('to')!,site.timezone)} refresh={version}/><ExternalPanels site={site} query={query} onSaved={()=>setVersion(n=>n+1)}/></>} {tab==='seo'&&<><SeoScans scans={rows(data.scans)}/><ManualSearchImport siteId={site.id} canAdmin={canAdmin}/></>} {tab === 'seo' && <ExternalPanels site={site} query={query} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'retention' && <CohortTable cohorts={(data.cohorts || {}) as Row} retention={data.retention as Row|undefined}/>} {tab === 'vitals' && <VitalsTable vitals={rows(data.vitals)}/>} {tab==='pages'&&<PageDetail siteId={site.id} pages={rows(data.pages)} query={query}/>} {tab === 'userpaths' && <IdentityView site={site} data={data} query={query} registrationEvent={registrationEvent} onRegistrationEvent={setRegistrationEvent}/>} {tab === 'sources' && <SegmentExplorer segments={rows(data.dimensionRows)}/>} {tab==='audience'&&profile.profile==='standard'&&<GeographyExplorer siteId={site.id} query={query}/>} {tab === 'audience' && <SegmentExplorer segments={rows(data.dimensionRows)} geography/>} {tab === 'events' && <EventProperties events={rows(data.events)}/>} {tab === 'heatmap' && <Heatmap points={rows(data)}/>} {tab === 'serp' && <Action title={t("检查关键词排名")} endpoint={`/api/sites/${site.id}/serp/check`} fields={[["keyword", "关键词"], ["provider", "提供方（serpapi/dataforseo）"]]} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'suggestions' && <SuggestionActions base={`/api/sites/${site.id}`} query={query} timezone={site.timezone} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'ai' && <AIPanels site={site} query={query} canAdmin={canAdmin} refresh={version} onSaved={() => setVersion(n => n + 1)}/>}</>;
}
function ExperimentWorkflow({ site, onSaved }: {
    site: Site;
    onSaved: () => void;
}) {
    const [error, setError] = useState('');
    const [result, setResult] = useState<Row>();
    return <section className="panel"><h2>{t("实验创建与归因接入")}</h2><p>{t("实验需标准标识模式、明确的访客同意以及站点实验开关。分配按稳定标识确定，不是跨日隐私访客缝合。转化由采集到的真实目标事件触发。小样本或前端自述事件不能证明因果。")}</p><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try {
        setResult(await api<Row>(`/api/v1/sites/${site.id}/experiments`, { name: f.get('name'), variants: String(f.get('variants')).split('\n').map(s => s.trim()).filter(Boolean), goal: f.get('goal') }));
        onSaved();
    }
    catch (err) {
        setError((err as Error).message);
    } }}><label>{t("实验名称")}<input name="name" required/></label><label>{t("变体名称（每行一个，至少两个）")}<textarea name="variants" required placeholder="control\nvariant-b"/></label><label>{t("真实转化事件名称")}<input name="goal" required placeholder="signup"/></label><button>{t("创建实验")}</button></form>{result && <><h3>{t("宿主网站接入")}</h3><pre>{`// ${t('仅在访客明确同意后调用，visitor_id 来自第一方 _baize_uid')}
fetch('${location.origin}/api/v1/experiments/${result.id}/assign', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({site_id:'${site.id}', visitor_id:uid, consent:true})
}).then(r => r.json()).then(({variant}) => applyVariant(variant));
// ${t('真实转化发生后：')}baize.track('${t('你的目标事件名')}');`}</pre></>}{error && <p role="alert" className="error">{error}</p>}</section>;
}
function QueryHealth({data,timezone,query,compact=false}:{data:Row;timezone:string;query:string;compact?:boolean}){
 const [mobileHost,setMobileHost]=useState<HTMLElement|null>(null);useEffect(()=>{const media=window.matchMedia('(max-width:767px)'),update=()=>setMobileHost(compact&&media.matches?document.getElementById('workspace-interpretation-host'):null);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[compact,query]);
 const en=language()==='en',storage=data.storage&&typeof data.storage==='object'&&!Array.isArray(data.storage)?data.storage as Row:{},source=Object.hasOwn(storage,'rollups')?storage.rollups:storage.source;
 if(data.watermark===undefined&&source===undefined)return null;
 const sessionUnavailable=typeof data.sessionMetricsStatus==='string'&&data.sessionMetricsStatus.startsWith('unavailable'),complete=data.coverage===1,instant=typeof data.watermark==='string'?new Date(data.watermark):null,valid=instant&&Number.isFinite(+instant),short=valid?new Intl.DateTimeFormat(en?'en-GB':'zh-CN',{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant):'—',range=new URLSearchParams(query);
 const evidence=[{field:en?'Session metrics status':'会话指标状态',value:data.sessionMetricsStatus},{field:en?'Verified query source':'本次查询核验来源',value:storageSourceLabel(source,en)},{field:en?'Requested from':'请求开始',value:data.requestedFrom??range.get('from')},{field:en?'Requested to':'请求结束',value:data.requestedTo??range.get('to')},{field:en?'Effective from':'有效开始',value:data.effectiveFrom??data.from},{field:en?'Effective to':'有效结束',value:data.effectiveTo??data.to},{field:en?'Watermark (ISO)':'水位（ISO）',value:data.watermark},{field:en?'Coverage':'覆盖率',value:typeof data.coverage==='number'?`${data.coverage*100}%`:'—'},{field:en?'Range status':'范围状态',value:data.rangeStatus},{field:en?'Aggregation epoch':'聚合 epoch',value:data.aggregationEpoch??data.epoch},{field:en?'Source epoch':'来源 epoch',value:storage.epoch},{field:en?'Source generation':'来源 generation',value:storage.generation},{field:en?'Source fallback reason':'来源回退原因',value:storage.fallbackReason}];
 const normal=complete&&!storage.fallbackReason&&!sessionUnavailable;const statusLine=<p className={`watermark compact-health${!normal?' notice':''}`} aria-live="polite"><span>{complete?(sessionUnavailable?(en?'Event coverage complete through ':'事件覆盖完整截至 '):(en?'Data complete through ':'数据完整截至 ')):(en?'Statistical watermark ':'统计水位 ')}{short}</span><span>{en?'Verified query source: ':'来源：'}{storageSourceLabel(source,en)}{en?'.':''}</span><strong>{complete?(sessionUnavailable?(en?'Events complete; session metrics unavailable':'事件覆盖完整；会话指标不可用'):(en?'Complete':'完整')):(en?'Partial / unavailable':'部分 / 不可用')}</strong>{sessionUnavailable&&<span>{en?'Retired session prefixes cannot be reconstructed; session counts, bounce, duration, goal attribution and completion are unavailable.':'保留期前会话前缀无法重建；会话数、跳出、时长、目标归因与完成指标不可用。'}</span>}</p>;
 const content=<section className={compact?"query-health compact-query-health":"query-health"} aria-label={en?'Query health and interpretation':'查询健康与数据口径'}>{(!compact||!normal)&&statusLine}<details><summary>{en?'View data interpretation and details':'查看数据口径 / 详情'}</summary>{compact&&normal&&statusLine}<p>{en?'Dates use the site timezone. Comparisons require complete coverage in both periods and a nonzero comparable baseline. Missing or unprocessed records are not zero. A source label describes this query only; missing authoritative bodies cause an error.':'日期按站点时区解释。比较要求两期完整覆盖且存在非零可比基线；缺失或未处理记录不是零。来源仅描述本次查询；权威正文缺失会使请求失败。'}</p>{Array.isArray(data.limitations)&&data.limitations.length>0&&<><h3>{en?'Limits of this query':'本次查询限制'}</h3><ul>{data.limitations.map((value,index)=><li key={index}>{String(value)}</li>)}</ul></>}<Table data={evidence}/></details></section>;return compact&&normal&&mobileHost?createPortal(content,mobileHost):content;
}
function factInsight(data:Row){const pv=Number((data.totals as Row)?.pv||0);const sources=rows(data.sources).sort((a,b)=>Number(b.pv)-Number(a.pv));if(!pv||!sources[0])return t('所选期间暂无已聚合的页面浏览。');const source=sources[0];return `${t('所选期间页面浏览')} ${pv} · ${t('首位来源')} ${String(source.channel)}: ${Number(source.pv)} (${(Number(source.pv)/pv*100).toFixed(1)}%)`;}
function HistoricalComparison({site,historical,query}:{site:Site;historical:Row[];query:string}){const [current,setCurrent]=useState<Row>({}),[error,setError]=useState('');useEffect(()=>{const controller=new AbortController();let active=true;setCurrent({});setError('');void api<Row>(`/api/v1/sites/${site.id}/stats?${query}`,undefined,'GET',controller.signal).then(result=>{if(active)setCurrent(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;controller.abort();};},[site.id,query]);const byDay=new Map<string,{day:string;localPV:number|null;historicalPV:number|null}>();for(const row of rows(current.trend)){const day=civilDate(String(row.time),site.timezone);const record=byDay.get(day)||{day,localPV:current.coverage===1?0:null,historicalPV:null};if(record.localPV!==null)record.localPV+=Number(row.pv);byDay.set(day,record);}for(const row of historical){const day=String(row.day).slice(0,10);const record=byDay.get(day)||{day,localPV:null,historicalPV:0};record.historicalPV=(record.historicalPV||0)+Number(row.pv);byDay.set(day,record);}return <section className="panel"><h2>{t("GA4 历史聚合虚线对照")}</h2><p>{t("仅比较 PV 聚合。来源分组 UV 不相加；GA4 属性时区与本站时区可能不同。该导入不还原访客、事件流或漏斗历史。无记录的日期留空，不伪造零值。")}</p>{error&&<p className="error" role="alert">{error}</p>}<Suspense fallback={<p>{t("正在加载历史对照…")}</p>}><HistoryChart data={[...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day))}/></Suspense></section>;}
function PageDetail({siteId,pages,query}:{siteId:string;pages:Row[];query:string}){const [path,setPath]=useState('');const [data,setData]=useState<Row>();const [error,setError]=useState('');const chosen=path||String(pages[0]?.path||'');useEffect(()=>{const controller=new AbortController();let active=true;setData(undefined);setError('');if(chosen)void api<Row>(`/api/v1/sites/${siteId}/pages/detail?${query}&path=${encodeURIComponent(chosen)}`,undefined,'GET',controller.signal).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;controller.abort();};},[siteId,chosen,query]);return <section className="panel"><h2>{t("单页面详情")}</h2><label>{t("选择已采集页面")}<select value={chosen} onChange={e=>setPath(e.target.value)}>{pages.map(p=><option key={String(p.path)}>{String(p.path)}</option>)}</select></label>{error&&<p role="alert" className="error">{error}</p>}{data&&<><p>{t("筛选来自保留明细中的真实事件，过期明细不推断。水位")}{readable(data.watermark)}{t("· 覆盖率")}{(Number(data.coverage)*100).toFixed(0)}{t("%。会话/目标按落地页归因。")}</p><Chart data={rows(data.trend)}/><h3>{t("页面来源")}</h3><Table data={rows(data.sources)}/>{Object.entries((data.audience||{}) as Row).map(([dimension,values])=><section key={dimension}><h3>{ownValue(labels,dimension)||dimension}</h3><Table data={Object.entries(values as Row).map(([value,count])=>({[dimension]:value,count}))}/></section>)}</>}</section>;}
function ReportRunner({ siteId, reports }: {
    siteId: string;
    reports: Row[];
}) { const [result, setResult] = useState<Row>(); const [error, setError] = useState(''); return <section className="panel"><h2>{t("打开已保存的筛选")}</h2>{reports.map(r => <p key={String(r.id)}><button className="secondary" onClick={() => void api<Row>(`/api/v1/sites/${siteId}/reports/${r.id}/run`).then(setResult).catch(e => setError(e.message))}>{String(r.name)}</button></p>)}{error && <p role="alert" className="error">{error}</p>}{result && <><p>{t("筛选口径：")}{readable(result.filter || result.dsl)}{t("· 水位")}{readable(result.watermark)}</p><p>{t("浏览量：")}{readable((result.summary as Row)?.pv)}{t("· 去重访客：")}{(result.summary as Row)?.uv === null ? t('该模式不支持') : readable((result.summary as Row)?.uv)}</p><Table data={rows(result.daily || result.rows || result.dimensionRows)}/></>}</section>; }
function ExternalPanels({ site, query, onSaved }: {
    site: Site;
    query: string;
    onSaved: () => void;
}) { const base = `/api/sites/${site.id}`; const [error, setError] = useState(''); const params = new URLSearchParams(query), start = civilDate(params.get('from')!, site.timezone), end = inclusiveEnd(params.get('to')!, site.timezone); return <><section className="panel"><h2>{t("搜索与站内健康")}</h2><p>{t("GSC 延迟 2–3 天，搜索词是聚合数据，不关联个人或订单。GA4 仅导入历史聚合报表，无法恢复事件、身份和漏斗历史。百度流量 API 尚待官方核验。")}</p><div className="actions"><button onClick={() => void api(`${base}/seo/scan`, {}).then(onSaved).catch(e => setError(e.message))}>{t("开始授权域名健康扫描")}</button><button className="secondary" onClick={() => void api<{
    url: string;
}>(`${base}/google/oauth`, {}).then(r => location.href = r.url).catch(e => setError(e.message))}>{t("连接 Google 账号")}</button></div>{['gsc', 'ga4'].map(kind => <button key={kind} className="secondary" onClick={() => void api(`${base}/${kind}/import`, { start, end }).then(onSaved).catch(e => setError(e.message))}>{t("导入")}{kind.toUpperCase()}{t("当前日期范围")}</button>)}{error && <p role="alert" className="error">{error}</p>}</section><GoogleSettings siteId={site.id} onSaved={onSaved}/><RankSettings siteId={site.id} onSaved={onSaved}/></>; }
function AIPanels({ site, query, canAdmin, refresh, onSaved }: {
    site: Site;
    query: string;canAdmin:boolean;refresh:number;
    onSaved: () => void;
}) { const [connection,setConnection]=useState<Row|undefined>(),[connectionError,setConnectionError]=useState('');useEffect(()=>{const controller=new AbortController();let active=true;setConnection(undefined);setConnectionError('');void api<Row>(`/api/sites/${site.id}/external`,undefined,'GET',controller.signal).then(result=>{if(active)setConnection(rows(result.connections).find(row=>row.kind==='ai')||{});}).catch(error=>{if(active)setConnectionError(error.message);});return()=>{active=false;controller.abort();};},[site.id,refresh]);const settings=(connection?.settings||{}) as Row,en=language()==='en';return <>{connection&&connection.kind!=='ai'&&<p className="notice">{en?'No model connection is saved. An administrator must configure an encrypted BYOK connection and explicitly enable aggregate sending before querying.':'尚未保存模型连接。请管理员先配置加密 BYOK 连接并明确启用聚合发送，再开始问数。'}</p>}<AskAnalytics siteId={site.id} start={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} end={inclusiveEnd(new URLSearchParams(query).get('to')!,site.timezone)} onSaved={onSaved}/><section className="panel"><h3>{en?'Saved model connection':'已保存的模型连接'}</h3>{connectionError&&<p role="alert" className="error">{connectionError}</p>}{!connection&&!connectionError&&<p role="status">{en?'Loading non-secret model summary…':'正在读取非秘密模型摘要…'}</p>}{connection?.kind==='ai'&&<p>{String(settings.model||'—')} · {settings.enabled===true?(en?'Aggregate sending enabled':'已启用聚合发送'):(en?'Aggregate sending disabled':'未启用聚合发送')} · {en?'Monthly token budget':'每月 Token 预算'}: {String(settings.monthlyTokenBudget??'—')}</p>}<p>{t("模型会收到用户输入的问题及已授权聚合。BYOK 发送到配置目标，不等于本地推理；费用由部署者承担。密钥加密保存、不回显；建议效果对比不能证明因果。")}</p>{canAdmin&&<details className="model-settings-entry"><summary>{en?'Configure or test the model connection':'配置或测试模型连接'}</summary><ModelSettings siteId={site.id} onSaved={onSaved}/></details>}</section></>; }

const suggestionLabels: Record<string, string> = { new: '新发现', accepted: '已接受', 'in-progress': '处理中', 'pending-recheck': '已修复待复检', verified: '已验证', 'false-positive': '误报' };
function SuggestionActions({ base, query, timezone, onSaved }: {
    base: string;query:string;timezone:string;
    onSaved: () => void;
}) { const [id, setId] = useState(''); const [items, setItems] = useState<Row[]>([]); const [error, setError] = useState(''); const [result, setResult] = useState<Row>(); const [status, setStatus] = useState('');const [evidence,setEvidence]=useState<Row>(); useEffect(() => { void api<Row>(`${base}/suggestions`).then(r => setItems(rows(r))).catch(e => setError(e.message)); }, [base, result]); const selected = items.find(r => r.id === id); const allowed = (suggestionTransitions[suggestionStatusSchema.parse(selected?.status||'new')] || []).filter(s => s !== 'verified' || Boolean(selected?.recheck)); return <><section className="panel"><h2>{t("从真实聚合创建证据建议")}</h2><p>{t("先固定当前日期范围的本地事实快照，不调用外部模型，不需要 API Key。建议是待验证假设；不将低质量证据当作结论。")}</p><button className="secondary" onClick={async()=>{const q=new URLSearchParams(query);try{setEvidence(await api<Row>(`${base}/evidence`,{start:civilDate(q.get('from')!,timezone),end:inclusiveEnd(q.get('to')!,timezone)}));}catch(err){setError((err as Error).message);}}}>{t("固定当前范围的事实快照")}</button>{evidence&&<><p role="status">{t("证据快照")}{String(evidence.id)} {t("· 来源")} {String(evidence.source)} {t("· 外部模型调用")} {String(evidence.aiCalled)}</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{setResult(await api<Row>(`${base}/suggestions`,{evidenceId:evidence.id,title:f.get('title'),confidence:f.get('confidence'),category:f.get('category')}));onSaved();}catch(err){setError((err as Error).message);}}}><label>{t("整改建议标题")}<input name="title" required/></label><label>{t("证据置信度")}<select name="confidence"><option value="low">{t("低 · 证据不足或样本少")}</option><option value="medium">{t("中 · 需要复核")}</option><option value="high">{t("高 · 多源事实一致")}</option></select></label><label>{t("建议分类")}<select name="category"><option value="analysis">{t("分析")}</option><option value="seo">{t("SEO · 复检将触发授权域名复扫")}</option><option value="performance">{t("性能")}</option><option value="content">{t("内容")}</option></select></label><button>{t("创建证据关联建议")}</button></form></>}</section><section className="panel"><h2>{t('整改与复检')}</h2><label>{t("选择建议")}<select value={id} onChange={e => { setId(e.target.value); setStatus(''); }}><option value="">{t("请选择证据关联建议")}</option>{items.map(r => <option key={String(r.id)} value={String(r.id)}>{String(r.title)} · {t(suggestionLabels[String(r.status)] || String(r.status))}</option>)}</select></label>{selected && <><p>{t('优先级代理')}：{readable(selected.priority_score)} · {t('影响数量')}：{readable((selected.priority_basis as Row)?.affectedCount)} · {t('观测严重度')}：{readable((selected.priority_basis as Row)?.observedSeverity)}</p><p className="notice">{t('此分数仅用于安排复核顺序，不是预测或实测收益。')}{readable((selected.priority_basis as Row)?.caveat)}</p><p>{t("当前状态：")}{t(suggestionLabels[String(selected.status)])}{t("· 证据 ID：")}{String(selected.evidence_id)}</p><details><summary>{t("查看不可变事实快照")}</summary><pre>{JSON.stringify(selected.evidence, null, 2)}</pre></details>{allowed.length > 0 && <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget), payload: Row = { status: f.get('status') }; if (f.get('implementedAt'))
    payload.implementedAt = new Date(String(f.get('implementedAt'))).toISOString(); try {
    setResult(await api<Row>(`${base}/suggestions/${id}`, payload, 'PATCH'));
    onSaved();
    setStatus('');
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("下一状态")}<select name="status" required value={status} onChange={e => setStatus(e.target.value)}><option value="">{t("请选择下一状态")}</option>{allowed.map(s => <option value={s} key={s}>{t(suggestionLabels[s])}</option>)}</select></label>{status === 'pending-recheck' && <label>{t("实施时间（必填）")}<input name="implementedAt" type="datetime-local" required/></label>}<button>{t("保存整改状态")}</button></form>}{selected.status === 'pending-recheck' && <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try {
    setResult(await api<Row>(`${base}/suggestions/${id}/recheck`, { start: f.get('start'), end: f.get('end'), confounders: String(f.get('confounders')).split('\n').map(s => s.trim()).filter(Boolean) }));
    onSaved();
}
catch (err) {
    setError((err as Error).message);
} }}><h3>{t("复检证据与效果")}</h3><label>{t("复检开始日期")}<input type="date" name="start" required/></label><label>{t("复检结束日期")}<input type="date" name="end" required/></label><label>{t("干扰因素（每行一个，必填）")}<textarea name="confounders" required placeholder={t("流量波动、季节性、同期其他改动")}/></label><p>{t("前后变化仅为观察性对照，不能据此证明优化有效。")}</p><button>{t("执行复检")}</button></form>}{selected.recheck && <details open><summary>{t("已保存复检证据")}</summary><pre>{JSON.stringify(selected.recheck, null, 2)}</pre></details>}</>}{result && <><SeoRecheckView value={result}/><details><summary>{language()==='en'?'Saved operation evidence':'已保存操作证据'}</summary><pre>{JSON.stringify(result, null, 2)}</pre></details></>}{error && <p role="alert" className="error">{error}</p>}</section></>; }
type Field = [
    string,
    string,
    string?
];
function Action({ title, endpoint, method = 'POST', fields, onSaved, scopeLabel, currentRetention }: {
    title: string;scopeLabel?:string;currentRetention?:number;
    endpoint: string;
    method?: string;
    fields: Field[];
    onSaved: () => void;
}) { const [result, setResult] = useState<Row>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); return <section className="panel"><h2>{t(title)}</h2><form onSubmit={async (e) => { e.preventDefault();if(busy)return;const input=new FormData(e.currentTarget);if(endpoint.endsWith('/delete-visitor')&&!window.confirm(`${t('此操作永久删除所指定访客的明细并阻止重建。确认继续？')}\n${scopeLabel||''}\n${['visitor_id','user_id'].flatMap(key=>input.get(key)?[`${key}: ${String(input.get(key))}`]:[]).join('\n')||'—'}`))return;if(endpoint.endsWith('/retention')&&currentRetention!==undefined&&Number(input.get('days'))<currentRetention&&!window.confirm(`${language()==='en'?'Shortening retention can permanently remove older detail. Continue?':'缩短保留期可能永久删除较旧明细，确认继续？'}\n${scopeLabel||''}\n${currentRetention} → ${String(input.get('days'))} ${language()==='en'?'days':'天'}`))return; setBusy(true); setError(''); try {
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const payload: Row = {};
    for (const [name, , type] of fields) {
        const value = f[name];
        if (value === '')
            continue;
        payload[name] = type === 'json' ? JSON.parse(String(value)) : type === 'number' ? Number(value) : type === 'datetime-local' ? new Date(String(value)).toISOString() : value;
    }
    setResult(await api<Row>(endpoint, payload, method));
    onSaved();
}
catch (err) {
    setError((err as Error).message);
}
finally {
    setBusy(false);
} }}>{fields.map(([name, label, type]) => <label key={name}>{t(label)}{type === 'json' ? <textarea name={name} placeholder="{}"/> : <input name={name} type={type || 'text'}/>}</label>)}<button disabled={busy}>{busy ? t('正在提交…') : t(title)}</button></form>{error && <p className="error" role="alert">{error}</p>}{result && <pre role="status">{JSON.stringify(result, null, 2)}</pre>}</section>; }
function Share() { const [data, setData] = useState<Row>(); const [error, setError] = useState(''); const token = location.pathname.split('/')[2]; function unlock(password: string) { void api<Row>(`/api/v1/shares/${encodeURIComponent(token || '')}`, { password }).then(setData).catch(e => setError(e.message)); } useEffect(() => { unlock(''); }, []); return <div className="auth"><a className="brand" href="/">{t("白泽 · 只读分享")}</a><section className="panel">{data ? <><h1>{readable(data.site_name)}</h1><Chart data={rows(data.days)}/><Table data={rows(data.days)}/><p>{t("仅展示被授权的汇总信息，不提供站点配置与原始明细。")}</p></> : <><h1>{t("查看分享看板")}</h1>{error && <p role="alert" className="error">{error}</p>}<form onSubmit={e => { e.preventDefault(); unlock(String(new FormData(e.currentTarget).get('password'))); }}><label>{t("分享密码")}<input name="password" type="password"/></label><button>{t("打开只读看板")}</button></form></>}</section></div>; }
function Invitation() { const [message, setMessage] = useState(''); const [registered, setRegistered] = useState(false); const token = encodeURIComponent(location.pathname.split('/')[2] || ''); return <div className="auth"><section className="panel"><h1>{t("加入站点团队")}</h1><p>{t("此邀请仅为指定邮箱授予站点角色，不开放公共注册。")}</p>{registered ? <><p role="status">{message}</p><a className="button" href="/login">{t("使用受邀邮箱登录")}</a></> : <form onSubmit={async (e) => { e.preventDefault(); try {
    const r = await api<{
        email: string;
        message: string;
    }>(`/api/v1/invites/${token}/register`, Object.fromEntries(new FormData(e.currentTarget)));
    setMessage(`${r.email} · ${t('账号已建立，请登录')}`);
    setRegistered(true);
}
catch (err) {
    setMessage((err as Error).message);
} }}><label>{t("姓名")}<input name="name" required/></label><label>{t("设置密码")}<input name="password" type="password" minLength={12} required autoComplete="new-password"/></label><button>{t("注册并接受邀请")}</button></form>}<p>{t("已有账号？先")}<a href="/login">{t("登录")}</a>{t("，然后回到此页接受。")}</p><button className="secondary" onClick={() => void api(`/api/v1/invites/${token}/accept`, {}).then(() => { location.href = '/app'; }).catch(e => setMessage(e.message))}>{t("已有账号，接受邀请")}</button>{message && !registered && <p role="alert" className="error">{message}</p>}</section></div>; }
document.documentElement.lang=language();
const path = location.pathname;
createRoot(document.getElementById('root')!).render(<React.StrictMode>{path === '/setup' ? <Auth setup/> : path === '/login' ? <Auth /> : path.startsWith('/app') ? <App /> : path.startsWith('/share/') ? <Share /> : path.startsWith('/invite/') ? <Invitation /> : <Landing />}</React.StrictMode>);
