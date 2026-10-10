import InstallationSnippet from './InstallationSnippet';
import {SavedReport,type SavedReportRecord} from './SavedReport';
import {MemberRoleEditor} from './MemberRoleEditor';
import {reportFilterKeys} from '../../packages/contracts/report-definition';
import {StorageEvidence} from './StorageEvidence';
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
import { dateRange, civilDate } from './time';
import { RealtimeSummary } from './RealtimeSummary';
import { SegmentExplorer, EventProperties, Heatmap, CohortTable, VitalsTable } from './AnalysisDetails';
import { ModelSettings, GoogleSettings, GoalEditor, FunnelEditor, ShareEditor, InviteEditor, PrivacyFeatures, RankSettings, AskAnalytics } from './Connectors';
const ReplayViewer = lazy(() => import('./ReplayViewer'));
const HistoryChart=lazy(()=>import('./Charts').then(module=>({default:module.HistoryChart})));
const Visualization = lazy(() => import('./Charts'));
const labels: Record<string, string> = { pv: t('浏览量'), uv: t('访客'), sessions: t('会话'), bounceRate: t('跳出率'), averageDuration: t('平均时长秒数'), visibleSeconds: t('可见秒数'), sampleCount: t('样本数'), time: t('时间'), completionRate: t('读完率'), entries: t('入口'), exits: t('出口'), bounce_rate: t('跳出率'), avg_dwell_s: t('平均可见秒数'), revenue: t('自述收入'), path: t('页面'), name: t('名称'), error:t('任务错误'), event_name: t('事件'), visitors: t('访客'), count: t('次数'), country: t('国家'), region:t('区域'),screen:t('屏幕分辨率'),language:t('访问语言'),keyword:t('搜索词'), city: t('城市'), device: t('设备'), browser: t('浏览器'), os: t('系统'), channel: t('渠道'), referrer: t('来源'), date: t('日期'), day: t('日期'), hour: t('小时'), conversions: t('转化'), rate: t('转化率'), returned: t('回访人数'), cohort_size: t('同期群人数'), metric: t('指标'), p75: 'p75', p90: 'p90', sample_count: t('样本数'), created_at: t('创建时间'), action: t('操作'), role: t('角色'), email: t('邮箱'), status: t('状态'), title: t('标题'), clicks: t('点击'), impressions: t('展示'), position: t('排名'), query: t('搜索词'), coverage: t('覆盖率') };
function metric(k: string, v: unknown): string { if (v === null || v === undefined)
    return t('该模式不支持'); if (['bounceRate', 'completionRate', 'rate'].includes(k))
    return `${(Number(v) * 100).toFixed(1)}%`; if (typeof v === 'number')
    return Number.isInteger(v) ? v.toLocaleString('zh-CN') : v.toFixed(2); return readable(v); }
function readable(v: unknown): string { if (v === null || v === undefined)
    return '—'; if (typeof v === 'object')
    return JSON.stringify(v); return String(v); }
function Table({ data }: {
    data: Row[];
}) { if (!data.length)
    return <p className="empty">{t("当前范围尚无数据。安装追踪代码后，等待采集与聚合完成。")}</p>; const keys = [...new Set(data.flatMap(row => Object.keys(row)))].filter(k => !['site_id', 'token_hash', 'password_hash'].includes(k)); return <div className="table-wrap"><table><thead><tr>{keys.map(k => <th key={k} scope="col">{ownValue(labels,k) || k}</th>)}</tr></thead><tbody>{data.map((r, i) => <tr key={i}>{keys.map(k => <td key={k}>{k==='uv'&&r[k]===null?t('该模式不支持'):['error','last_error'].includes(k)&&r[k]?localizedErrorCode(r[k]):readable(r[k])}</td>)}</tr>)}</tbody></table></div>; }
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
function App() { const [siteTag,setSiteTag]=useState(''); const [filters,setFilters]=useState<Row>({}); const [health,setHealth]=useState<Row>({});const [user, setUser] = useState<Row>({}); const [sites, setSites] = useState<Site[]>([]); const [siteId, setSiteId] = useState(''); const [tab, setTab] = useState('overview'); const [from, setFrom] = useState(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)); const [to, setTo] = useState(new Date().toISOString().slice(0, 10)); const [error, setError] = useState(''); const [adding, setAdding] = useState(false); const [refresh, setRefresh] = useState(0); useEffect(() => { api<Row>('/api/me').then(r => { setUser(r.user as Row);void api<Row>('/healthz').then(setHealth).catch(()=>{}); return api('/api/v1/sites'); }).then(r => { const all = rows(r) as Site[]; setSites(all); setSiteId(id => id || all[0]?.id || ''); }).catch(e => { if (/unauth|401/i.test(e.message))
    location.href = '/login';
else
    setError(e.message); }); }, [refresh]); useEffect(()=>{const selected=sites.find(s=>s.id===siteId);if(!selected)return;const today=civilDate(new Date().toISOString(),selected.timezone);const first=new Date(`${today}T12:00:00Z`);first.setUTCDate(first.getUTCDate()-6);setFrom(first.toISOString().slice(0,10));setTo(today);setFilters({});},[siteId]);const site = sites.find(s => s.id === siteId); const admin = user.is_admin === true || ['owner', 'admin'].includes(site?.current_role || ''); const adminTabs = ['shares', 'tokens', 'members', 'audit', 'jobs', 'privacy', 'exports', 'channels', 'schedules', 'alerts', 'settings', 'seo', 'suggestions']; const visibleTabs = tabs.filter(([key]) => admin || !adminTabs.includes(key)); return <div className="workspace"><aside><a href="/" className="brand">{t("白泽")}<small>BAIZE</small></a><LanguagePicker /><label>{t("站点分组")}<select value={siteTag} onChange={e=>{setSiteTag(e.target.value);const next=sites.find(item=>!e.target.value||item.tags?.includes(e.target.value));if(next)setSiteId(next.id);}}><option value="">{t("全部分组")}</option>{[...new Set(sites.flatMap(item=>item.tags||[]))].map(tag=><option key={tag}>{tag}</option>)}</select></label><p className="sidebar-label">{t("工作空间")}</p><select aria-label={t("选择站点")} value={siteId} onChange={e => setSiteId(e.target.value)}>{sites.filter(item=>!siteTag||item.tags?.includes(siteTag)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{user.is_admin === true && <button className="secondary" onClick={() => setAdding(true)}>{t("＋ 添加站点")}</button>}<nav>{visibleTabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} aria-current={tab===k?'page':undefined} onClick={() => setTab(k)}>{l}</button>)}</nav><button className="secondary" onClick={() => void api('/api/logout', {}).then(() => location.href = '/')}>{t("退出登录")}</button></aside><main><header className="page-header"><div><p className="eyebrow">{site?.domain || t('你的分析工作空间')}</p><h1>{tabs.find(t => t[0] === tab)?.[1]}</h1></div><div className="date-range"><label>{t("开始")}<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>{t("结束")}<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label><button onClick={() => setRefresh(n => n + 1)}>{t("刷新")}</button></div></header>{['overview','pages','sources','audience','events','downloads','notFound','eventTrend','goals','funnels','retention','paths','vitals','revenue','userpaths'].includes(tab)&&<DashboardFilters value={filters} onApply={setFilters}/>}{health.geoip==='unknown'&&<p className="notice">{t("地域库尚未配置，地域显示未知。可在环境设置中配置 MAXMIND_ACCOUNT_ID 与 MAXMIND_LICENSE_KEY 后重启；不会推测或外发原始 IP。")}</p>}{error && <p className="error" role="alert">{error}</p>}{adding ? <section className="panel"><h2>{t("添加站点")}</h2><form onSubmit={e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); void api('/api/v1/sites', { ...f, tags: String(f.tags||'').split(',').map(value=>value.trim()).filter(Boolean) }).then(() => { setAdding(false); setRefresh(n => n + 1); }).catch(err => setError(err.message)); }}><SiteFields /><button>{t("创建站点")}</button><button type="button" className="secondary" onClick={() => setAdding(false)}>{t("取消")}</button></form></section> : site ? <View key={`${siteId}-${tab}`} site={site} tab={tab} query={`${dateRange(from, to, site.timezone)}&${filterQuery(filters)}`} refresh={refresh} canWrite={admin || site.current_role === 'analyst'} canAdmin={admin}/> : <section className="panel"><h2>{t("添加站点，开始收集真实访问")}</h2><p>{t("这里没有演示数据。创建站点并安装追踪代码后，数据会出现在看板。")}</p><button onClick={() => setAdding(true)}>{t("添加第一个站点")}</button></section>}</main></div>; }
function View({ site, tab, query, refresh, canWrite, canAdmin }: {
    site: Site;
    tab: string;
    query: string;
    refresh: number;
    canWrite: boolean;canAdmin:boolean;
}) {
    const [data, setData] = useState<Row>({});
    const [analysis, setAnalysis] = useState<Row>({});
    const [previous, setPrevious] = useState<Row>({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);
    const [registrationEvent,setRegistrationEvent]=useState('signup');
    const base = `/api/v1/sites/${site.id}`;
    const endpoint = ['overview', 'pages', 'sources', 'audience', 'events', 'retention', 'paths', 'vitals'].includes(tab) ? 'stats' : ['downloads','notFound','eventTrend'].includes(tab)?'content':tab === 'privacy' ? 'usage' : tab === 'settings' ? 'usage' : tab === 'userpaths' ? 'identities' : tab;
    const requestPath = ['seo', 'ai', 'gsc', 'ga4', 'serp', 'suggestions', 'seo-conversions'].includes(tab) ? `/api/sites/${site.id}/${tab === 'seo' ? 'seo/scans' : tab === 'ai' ? 'ai/usage' : tab === 'seo-conversions' ? 'seo/conversions' : tab}${['gsc', 'ga4', 'seo-conversions'].includes(tab) ? `?start=${civilDate(new URLSearchParams(query).get('from')!, site.timezone)}&end=${civilDate(new URLSearchParams(query).get('to')!, site.timezone)}` : ''}` : `${base}/${endpoint}?${query}${endpoint==='identities'?`&registrationEvent=${encodeURIComponent(registrationEvent)}`:''}`;
    useEffect(() => {
        const controller = new AbortController(); let active = true;
        setLoading(true); setError(''); setData({});
        void api<Row>(requestPath, undefined, 'GET', controller.signal).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [requestPath, refresh, version]);
    const pendingAggregation = endpoint === 'stats' && data.coverage !== undefined && Number(data.coverage) < 1 && data.rangeStatus !== 'partial_unavailable';
    useEffect(() => {
        if (!pendingAggregation) return;
        const controller = new AbortController(); let active = true, busy = false;
        const timer = setInterval(() => {
            if (busy || document.visibilityState === 'hidden') return;
            busy = true;
            void api<Row>(requestPath, undefined, 'GET', controller.signal).then(result => { if (active) { setData(result); setError(''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { busy = false; });
        }, 2000);
        return () => { active = false; controller.abort(); clearInterval(timer); };
    }, [requestPath, pendingAggregation, refresh, version]);
    useEffect(() => {
        if (!['goals', 'funnels'].includes(tab)) return;
        const controller = new AbortController(); let active = true; setAnalysis({});
        void api<Row>(`${base}/analysis?${query}`, undefined, 'GET', controller.signal).then(result => { if (active) setAnalysis(result); }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; controller.abort(); };
    }, [base, tab, query, version]);
    useEffect(() => {
        if (tab !== 'overview') return;
        const controller = new AbortController(); let active = true; setPrevious({});
        const q = new URLSearchParams(query); const from = +new Date(q.get('from')!), to = +new Date(q.get('to')!), length = to - from;
        q.set('from',new Date(from-length).toISOString());q.set('to',new Date(from).toISOString());
        void api<Row>(`${base}/stats?${q}`, undefined, 'GET', controller.signal).then(result => { if (active) setPrevious(result); }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; controller.abort(); };
    }, [base, tab, query, version, data.coverage]);
    useEffect(() => {
        if (tab !== 'realtime') return;
        const controller = new AbortController(); let active = true;
        let onlineTimer: ReturnType<typeof setTimeout> | undefined;
        const refreshLive = () => void api<Row>(`${base}/realtime`, undefined, 'GET', controller.signal).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); });
        const stream = new EventSource(`${base}/realtime/stream`);
        stream.onmessage = message => {
            if (!active) return;
            const event = JSON.parse(message.data) as Row;
            if (!onlineTimer) onlineTimer = setTimeout(() => { onlineTimer = undefined; refreshLive(); }, 500);
            setData(current => ({ ...current, events: [event, ...rows(current.events).filter(e => e.event_id !== event.event_id)].slice(0, 200) }));
        };
        const timer = setInterval(refreshLive, 30000);
        return () => { active = false; controller.abort(); stream.close(); clearInterval(timer); clearTimeout(onlineTimer); };
    }, [base, tab]);
    if (['downloads','notFound','eventTrend'].includes(tab)) return <ContentAnalysis siteId={site.id} query={query} kind={tab as 'downloads'|'notFound'|'eventTrend'}/>;
    if (tab === 'settings')
        return <section className="panel"><h2>{t("追踪代码与站点信息")}</h2><SiteMetadata site={site} onSaved={()=>setVersion(n=>n+1)}/><Snippet site={site}/><p>{t("标识模式：")}{site.privacy_mode === 'daily_salt' ? t('每日盐隐私模式') : t('标准模式')}{t("· 时区：")}{site.timezone}</p><Action title="更新保留策略" endpoint={`${base}/retention`} method="PATCH" fields={[['days', '明细保留天数', 'number']]} onSaved={() => setVersion(n => n + 1)}/><PrivacyFeatures key={JSON.stringify(site.config)} siteId={site.id} initial={site.config} onSaved={() => setVersion(n => n + 1)}/><SourceSettings siteId={site.id} initial={site.config} onSaved={() => setVersion(n=>n+1)}/><GeoIpSettings/><Action title="实例企业微信 SSO（仅实例管理员）" endpoint="/api/admin/sso/wecom" method="PUT" fields={[["corpId", "企业 ID"], ["agentId", "应用 ID"], ["secret", "应用密钥", "password"], ["enabled", "启用 true/false", "json"], ["mappings", "已授权外部成员与本地用户映射 JSON", "json"]]} onSaved={() => setVersion(n => n + 1)}/></section>;
    return <><StorageEvidence storage={data.storage}/>{pendingAggregation && <p role="status" className="notice">{t("聚合任务尚未完成，正在自动更新。")}</p>}{loading && <p role="status">{t("正在读取真实数据…")}</p>}{error && <p className="error" role="alert">{t("请求失败：")}{error}</p>}{data.watermark !== undefined && <p className="watermark">{t("数据水位：")}{readable(data.watermark)}{t("· 覆盖率：")}{`${Math.round(Number(data.coverage) * 100)}%`}{t("。未聚合数据不视为零。")}</p>}{site.privacy_mode === 'daily_salt' && ['overview', 'retention'].includes(tab) && <p className="notice">{t("每日盐隐私模式不支持跨日访客去重、回访与留存。")}</p>}{tab === 'revenue' ? <RevenueView data={data}/> : tab === 'overview' ? <><div className="metrics">{Object.entries((data.totals || data.summary || {}) as Row).filter(([key])=>!['revenueByCurrency','revenueCurrencyStatus','revenueCurrencyCoverage'].includes(key)).map(([k, v]) => <article key={k}><span>{ownValue(labels,k) || k}</span><strong>{metric(k, v)}</strong></article>)}</div><section className="panel"><h2>{t("收入币种与归因")}</h2><p>{t("收入为业务方自述，不代表实际支付对账。不同币种分别展示，不直接相加。")}</p>{(data.revenueCurrencyStatus||(data.totals as Row)?.revenueCurrencyStatus)==='unsupported_legacy_currency'&&<p className="notice">{t("部分历史聚合未记录币种，无法完整核算收入。下方仅展示已知币种金额，不能视为全部收入；币种覆盖率：")}{Math.round(Number(data.revenueCurrencyCoverage||(data.totals as Row)?.revenueCurrencyCoverage||0)*100)}%。</p>}<Table data={Object.entries((data.revenueByCurrency||(data.totals as Row)?.revenueByCurrency||{}) as Row).map(([currency,amount])=>({currency,amount}))}/><Table data={rows(data.revenueAttributionRows)}/></section><section className="panel"><h2>{t("访问趋势")}</h2><p>{t("实际查询范围")}{readable(data.effectiveFrom)}{t("至")}{readable(data.effectiveTo)}。</p><Chart data={rows(data.trend)}/><Comparison current={data} previous={previous}/><Table data={rows(data.trend)}/></section></> : <section className="panel"><h2>{tabs.find(t => t[0] === tab)?.[1]}{t("数据")}</h2>{tab === 'replay' && <Suspense fallback={<p>{t("加载隐私回放播放器…")}</p>}><ReplayViewer chunks={rows(data)}/></Suspense>}{tab === 'paths' && <PathChart data={rows(data.paths)}/>} {data.insight !== undefined && <p className="notice">{factInsight(data)}</p>}{tab === 'funnels' && analysis.funnelStatus === 'unsupported_in_this_mode' && <p className="notice">{t('该模式不支持')}{t("：每日盐不能跨日识别漏斗访客。")}</p>}{tab === 'realtime' && <RealtimeSummary data={data}/>}{['goals', 'funnels'].includes(tab) && <section><h3>{t("选定范围的实际转化与流失")}</h3><Table data={rows(analysis[tab])}/></section>}{tab === 'privacy' && <p>{t("事件数：")}{readable(data.event_count)}{t("· 占用字节：")}{readable(data.bytes)}</p>}{!['seo','audience','retention','jobs','privacy','settings','userpaths','revenue','experiments','replay','heatmap'].includes(tab)&&<Table data={rows(data).length ? rows(data) : rows(data[tab] || (tab==='realtime'?data.events:undefined) || data.scans || data.connections || data.rows)}/>}{tab === 'audience' && Object.entries((data.audience || {}) as Row).filter(([dimension])=>dimension!=='ip_truncated').map(([dimension, values]) => <section key={dimension}><h3>{ownValue(labels,dimension) || dimension}</h3><Table data={Object.entries(values as Row).map(([value, count]) => ({ [dimension]: value, count }))}/></section>)}{tab === 'retention' && <Table data={Object.entries((data.cohorts || {}) as Row).filter(([key]) => key !== 'status').map(([date, value]) => ({ date, ...value as Row }))}/>} {Object.entries(data).filter(([k, v]) => Array.isArray(v) && k !== tab && !['rows', 'data', 'items'].includes(k) && !['pages', 'sources', 'audience', 'events', 'retention', 'paths', 'vitals','realtime','userpaths'].includes(tab)).map(([k, v]) => <section key={k}><h3>{ownValue(labels,k) || k}</h3><Table data={rows(v)}/></section>)}</section>}{['goals','funnels'].includes(tab)&&<AdvancedGoalAnalysis siteId={site.id} query={query} goals={rows(analysis.goals)} funnels={rows(analysis.funnels)} kind={tab as 'goals'|'funnels'}/>} {canWrite && ['reports', 'shares', 'tokens', 'members', 'goals', 'funnels'].includes(tab) && rows(data).length > 0 && <section className="panel"><h2>{t("管理记录")}</h2>{rows(data).map(row => <p key={String(row.id)}>{readable(row.name || row.email || row.id)} <button className="secondary" onClick={() => { if (window.confirm(t(tab === 'shares' || tab === 'tokens' ? '确定吊销此记录？' : '确定删除此记录？')))
        void api(`${base}/${tab}/${row.id}`, undefined, 'DELETE').then(() => setVersion(n => n + 1)).catch(e => setError(e.message)); }}>{tab === 'shares' || tab === 'tokens' ? t('吊销') : t('删除')}</button></p>)}</section>} {tab === 'alerts' && rows(data).length > 0 && <section className="panel"><h2>{t("静默告警")}</h2>{rows(data).map(row => <p key={String(row.id)}>{readable(row.kind)} <button className="secondary" onClick={() => void api(`${base}/alerts/${row.id}/silence`, { hours: 24 }).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("静默 24 小时")}</button></p>)}</section>} {tab === 'exports' && <><ExportEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>{rows(data).filter(r => r.status === 'complete').map(r => <a className="button" key={String(r.id)} href={`${base}/exports/${r.id}`}>{t("下载")}{String(r.id)}</a>)}</>}{tab === 'channels' && <NotificationChannel siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'schedules' && <ReportSchedule siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab==='experiments'&&<ExperimentResults experiments={rows(data)} siteId={site.id} canAdmin={canAdmin} onSaved={()=>setVersion(n=>n+1)}/>} {canWrite && tab === 'experiments' && <ExperimentWorkflow site={site} onSaved={() => setVersion(n => n + 1)}/>} {canWrite && tab === 'goals' && <GoalEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {canWrite && tab === 'funnels' && <FunnelEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'jobs' && <section className="panel"><h2>{t("可靠采集与聚合恢复")}</h2><pre>{JSON.stringify(data, null, 2)}</pre><p>{t("仅管理员可重放死信。重放会使旧租约失效，并从 PostgreSQL 已持久化事件重新处理。")}</p><button onClick={() => void api(`${base}/jobs/replay`, {}).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("重放死信并重新聚合")}</button></section>}{tab === 'reports' && <ReportRunner siteId={site.id} reports={rows(data)}/>} {canWrite && tab === 'reports' && <SavedReport siteId={site.id} from={new URLSearchParams(query).get("from") || ""} to={new URLSearchParams(query).get("to") || ""} filters={Object.fromEntries(reportFilterKeys.flatMap(key=>{const value=new URLSearchParams(query).get(key);return value?[[key,value]]:[];}))} reports={rows(data) as unknown as SavedReportRecord[]} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'shares' && <ShareEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'tokens' && <TokenEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {canAdmin && tab === 'members' && <><MemberRoleEditor siteId={site.id} members={rows(data) as {id:string;email?:string;name?:string;role:string}[]} onSaved={() => setVersion(n => n + 1)}/><InviteEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/></>} {tab === 'alerts' && <AlertEditor siteId={site.id} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'privacy' && <><section className="panel"><h2>{t("导出与删除")}</h2><p>{t("删除会生成独立删除记录，并重建可重算聚合。超过明细保留期的历史无法完整重算。")}</p><button onClick={() => void api(`${base}/exports`, { format: 'csv' }).then(() => setVersion(n => n + 1)).catch(e => setError(e.message))}>{t("创建 CSV 导出任务")}</button></section><Action title={t("永久删除访客数据")} endpoint={`${base}/delete-visitor`} fields={[['visitor_id', '访客标识'], ['user_id', '已识别用户标识（可选）']]} onSaved={() => setVersion(n => n + 1)}/></>} {tab==='ga4'&&<><HistoricalComparison site={site} historical={rows(data.rows)} query={query}/><Ga4History siteId={site.id} start={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} end={civilDate(new URLSearchParams(query).get('to')!,site.timezone)} refresh={version}/><ExternalPanels site={site} query={query} onSaved={()=>setVersion(n=>n+1)}/></>} {tab==='seo'&&<><SeoScans scans={rows(data.scans)}/><ManualSearchImport siteId={site.id} canAdmin={canAdmin}/></>} {tab === 'seo' && <ExternalPanels site={site} query={query} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'retention' && <CohortTable cohorts={(data.cohorts || {}) as Row} retention={data.retention as Row|undefined}/>} {tab === 'vitals' && <VitalsTable vitals={rows(data.vitals)}/>} {tab==='pages'&&<PageDetail siteId={site.id} pages={rows(data.pages)} query={query}/>} {tab === 'userpaths' && <IdentityView site={site} data={data} query={query} registrationEvent={registrationEvent} onRegistrationEvent={setRegistrationEvent}/>} {tab === 'sources' && <SegmentExplorer segments={rows(data.dimensionRows)}/>} {tab==='audience'&&<GeographyExplorer siteId={site.id} query={query}/>} {tab === 'audience' && <SegmentExplorer segments={rows(data.dimensionRows)} geography/>} {tab === 'events' && <EventProperties events={rows(data.events)}/>} {tab === 'heatmap' && <Heatmap points={rows(data)}/>} {tab === 'serp' && <Action title={t("检查关键词排名")} endpoint={`/api/sites/${site.id}/serp/check`} fields={[["keyword", "关键词"], ["provider", "提供方（serpapi/dataforseo）"]]} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'suggestions' && <SuggestionActions base={`/api/sites/${site.id}`} query={query} timezone={site.timezone} onSaved={() => setVersion(n => n + 1)}/>} {tab === 'ai' && <AIPanels site={site} query={query} canAdmin={canAdmin} onSaved={() => setVersion(n => n + 1)}/>}</>;
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
function factInsight(data:Row){const pv=Number((data.totals as Row)?.pv||0);const sources=rows(data.sources).sort((a,b)=>Number(b.pv)-Number(a.pv));if(!pv||!sources[0])return t('所选期间暂无已聚合的页面浏览。');const source=sources[0];return `${t('所选期间页面浏览')} ${pv} · ${t('首位来源')} ${String(source.channel)}: ${Number(source.pv)} (${(Number(source.pv)/pv*100).toFixed(1)}%)`;}
function HistoricalComparison({site,historical,query}:{site:Site;historical:Row[];query:string}){const [current,setCurrent]=useState<Row>({}),[error,setError]=useState('');useEffect(()=>{const controller=new AbortController();let active=true;setCurrent({});setError('');void api<Row>(`/api/v1/sites/${site.id}/stats?${query}`,undefined,'GET',controller.signal).then(result=>{if(active)setCurrent(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;controller.abort();};},[site.id,query]);const byDay=new Map<string,{day:string;localPV:number|null;historicalPV:number|null}>();for(const row of rows(current.trend)){const day=civilDate(String(row.time),site.timezone);const record=byDay.get(day)||{day,localPV:current.coverage===1?0:null,historicalPV:null};if(record.localPV!==null)record.localPV+=Number(row.pv);byDay.set(day,record);}for(const row of historical){const day=String(row.day).slice(0,10);const record=byDay.get(day)||{day,localPV:null,historicalPV:0};record.historicalPV=(record.historicalPV||0)+Number(row.pv);byDay.set(day,record);}return <section className="panel"><h2>{t("GA4 历史聚合虚线对照")}</h2><p>{t("仅比较 PV 聚合。来源分组 UV 不相加；GA4 属性时区与本站时区可能不同。该导入不还原访客、事件流或漏斗历史。无记录的日期留空，不伪造零值。")}</p>{error&&<p className="error" role="alert">{error}</p>}<Suspense fallback={<p>{t("正在加载历史对照…")}</p>}><HistoryChart data={[...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day))}/></Suspense></section>;}
function PageDetail({siteId,pages,query}:{siteId:string;pages:Row[];query:string}){const [path,setPath]=useState('');const [data,setData]=useState<Row>();const [error,setError]=useState('');const chosen=path||String(pages[0]?.path||'');useEffect(()=>{const controller=new AbortController();let active=true;setData(undefined);setError('');if(chosen)void api<Row>(`/api/v1/sites/${siteId}/pages/detail?${query}&path=${encodeURIComponent(chosen)}`,undefined,'GET',controller.signal).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;controller.abort();};},[siteId,chosen,query]);return <section className="panel"><h2>{t("单页面详情")}</h2><label>{t("选择已采集页面")}<select value={chosen} onChange={e=>setPath(e.target.value)}>{pages.map(p=><option key={String(p.path)}>{String(p.path)}</option>)}</select></label>{error&&<p role="alert" className="error">{error}</p>}{data&&<><p>{t("筛选来自保留明细中的真实事件，过期明细不推断。水位")}{readable(data.watermark)}{t("· 覆盖率")}{(Number(data.coverage)*100).toFixed(0)}{t("%。会话/目标按落地页归因。")}</p><Chart data={rows(data.trend)}/><h3>{t("页面来源")}</h3><Table data={rows(data.sources)}/>{Object.entries((data.audience||{}) as Row).map(([dimension,values])=><section key={dimension}><h3>{ownValue(labels,dimension)||dimension}</h3><Table data={Object.entries(values as Row).map(([value,count])=>({[dimension]:value,count}))}/></section>)}</>}</section>;}
function ReportRunner({ siteId, reports }: {
    siteId: string;
    reports: Row[];
}) { const [result, setResult] = useState<Row>(); const [error, setError] = useState(''); return <section className="panel"><h2>{t("打开已保存的筛选")}</h2>{reports.map(r => <p key={String(r.id)}><button className="secondary" onClick={() => void api<Row>(`/api/v1/sites/${siteId}/reports/${r.id}/run`).then(setResult).catch(e => setError(e.message))}>{String(r.name)}</button></p>)}{error && <p role="alert" className="error">{error}</p>}{result && <><p>{t("筛选口径：")}{readable(result.filter || result.dsl)}{t("· 水位")}{readable(result.watermark)}</p><p>{t("浏览量：")}{readable((result.summary as Row)?.pv)}{t("· 去重访客：")}{(result.summary as Row)?.uv === null ? t('该模式不支持') : readable((result.summary as Row)?.uv)}</p><Table data={rows(result.daily || result.rows || result.dimensionRows)}/></>}</section>; }
function Comparison({ current, previous }: {
    current: Row;
    previous: Row;
}) { const now = (current.totals || {}) as Row, before = (previous.totals || {}) as Row; return <section><h3>{t("与上一等长区间比较")}</h3>{current.coverage !== 1 || previous.coverage !== 1 ? <p>{t("至少一个区间聚合覆盖不完整，暂不生成变化结论。")}</p> : <><div className="metrics">{['pv', 'uv', 'sessions', 'conversions', 'revenue'].map(k => <article key={k}><span>{ownValue(labels,k) || k}</span><strong>{now[k] === null || before[k] === null ? t('该模式不支持') : Number(before[k]) === 0 ? t('无可比较基线') : `${((Number(now[k]) / Number(before[k]) - 1) * 100).toFixed(1)}%`}</strong></article>)}</div><p>{t("本期")}{metric('pv', now.pv)}{t("次浏览，上一等长区间")}{metric('pv', before.pv)}{t("次。变化是观测结果，不能单独证明原因或优化效果。")}</p></>}</section>; }
function ExternalPanels({ site, query, onSaved }: {
    site: Site;
    query: string;
    onSaved: () => void;
}) { const base = `/api/sites/${site.id}`; const [error, setError] = useState(''); const params = new URLSearchParams(query), start = civilDate(params.get('from')!, site.timezone), end = civilDate(params.get('to')!, site.timezone); return <><section className="panel"><h2>{t("搜索与站内健康")}</h2><p>{t("GSC 延迟 2–3 天，搜索词是聚合数据，不关联个人或订单。GA4 仅导入历史聚合报表，无法恢复事件、身份和漏斗历史。百度流量 API 尚待官方核验。")}</p><div className="actions"><button onClick={() => void api(`${base}/seo/scan`, {}).then(onSaved).catch(e => setError(e.message))}>{t("开始授权域名健康扫描")}</button><button className="secondary" onClick={() => void api<{
    url: string;
}>(`${base}/google/oauth`, {}).then(r => location.href = r.url).catch(e => setError(e.message))}>{t("连接 Google 账号")}</button></div>{['gsc', 'ga4'].map(kind => <button key={kind} className="secondary" onClick={() => void api(`${base}/${kind}/import`, { start, end }).then(onSaved).catch(e => setError(e.message))}>{t("导入")}{kind.toUpperCase()}{t("当前日期范围")}</button>)}{error && <p role="alert" className="error">{error}</p>}</section><GoogleSettings siteId={site.id} onSaved={onSaved}/><RankSettings siteId={site.id} onSaved={onSaved}/></>; }
function AIPanels({ site, query, canAdmin, onSaved }: {
    site: Site;
    query: string;canAdmin:boolean;
    onSaved: () => void;
}) { return <section className="panel"><p>{t("模型会收到用户输入的问题及已授权聚合。BYOK 发送到配置目标，不等于本地推理；费用由部署者承担。密钥加密保存、不回显；建议效果对比不能证明因果。")}</p>{canAdmin&&<ModelSettings siteId={site.id} onSaved={onSaved}/>}<AskAnalytics siteId={site.id} start={civilDate(new URLSearchParams(query).get('from')!,site.timezone)} end={civilDate(new URLSearchParams(query).get('to')!,site.timezone)} onSaved={onSaved}/></section>; }
const suggestionLabels: Record<string, string> = { new: '新发现', accepted: '已接受', 'in-progress': '处理中', 'pending-recheck': '已修复待复检', verified: '已验证', 'false-positive': '误报' };
function SuggestionActions({ base, query, timezone, onSaved }: {
    base: string;query:string;timezone:string;
    onSaved: () => void;
}) { const [id, setId] = useState(''); const [items, setItems] = useState<Row[]>([]); const [error, setError] = useState(''); const [result, setResult] = useState<Row>(); const [status, setStatus] = useState('');const [evidence,setEvidence]=useState<Row>(); useEffect(() => { void api<Row>(`${base}/suggestions`).then(r => setItems(rows(r))).catch(e => setError(e.message)); }, [base, result]); const selected = items.find(r => r.id === id); const allowed = (suggestionTransitions[suggestionStatusSchema.parse(selected?.status||'new')] || []).filter(s => s !== 'verified' || Boolean(selected?.recheck)); return <><section className="panel"><h2>{t("从真实聚合创建证据建议")}</h2><p>{t("先固定当前日期范围的本地事实快照，不调用外部模型，不需要 API Key。建议是待验证假设；不将低质量证据当作结论。")}</p><button className="secondary" onClick={async()=>{const q=new URLSearchParams(query);try{setEvidence(await api<Row>(`${base}/evidence`,{start:civilDate(q.get('from')!,timezone),end:civilDate(q.get('to')!,timezone)}));}catch(err){setError((err as Error).message);}}}>{t("固定当前范围的事实快照")}</button>{evidence&&<><p role="status">{t("证据快照")}{String(evidence.id)} {t("· 来源")} {String(evidence.source)} {t("· 外部模型调用")} {String(evidence.aiCalled)}</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{setResult(await api<Row>(`${base}/suggestions`,{evidenceId:evidence.id,title:f.get('title'),confidence:f.get('confidence'),category:f.get('category')}));onSaved();}catch(err){setError((err as Error).message);}}}><label>{t("整改建议标题")}<input name="title" required/></label><label>{t("证据置信度")}<select name="confidence"><option value="low">{t("低 · 证据不足或样本少")}</option><option value="medium">{t("中 · 需要复核")}</option><option value="high">{t("高 · 多源事实一致")}</option></select></label><label>{t("建议分类")}<select name="category"><option value="analysis">{t("分析")}</option><option value="seo">{t("SEO · 复检将触发授权域名复扫")}</option><option value="performance">{t("性能")}</option><option value="content">{t("内容")}</option></select></label><button>{t("创建证据关联建议")}</button></form></>}</section><section className="panel"><h2>{t('整改与复检')}</h2><label>{t("选择建议")}<select value={id} onChange={e => { setId(e.target.value); setStatus(''); }}><option value="">{t("请选择证据关联建议")}</option>{items.map(r => <option key={String(r.id)} value={String(r.id)}>{String(r.title)} · {t(suggestionLabels[String(r.status)] || String(r.status))}</option>)}</select></label>{selected && <><p>{t('优先级代理')}：{readable(selected.priority_score)} · {t('影响数量')}：{readable((selected.priority_basis as Row)?.affectedCount)} · {t('观测严重度')}：{readable((selected.priority_basis as Row)?.observedSeverity)}</p><p className="notice">{t('此分数仅用于安排复核顺序，不是预测或实测收益。')}{readable((selected.priority_basis as Row)?.caveat)}</p><p>{t("当前状态：")}{t(suggestionLabels[String(selected.status)])}{t("· 证据 ID：")}{String(selected.evidence_id)}</p><details><summary>{t("查看不可变事实快照")}</summary><pre>{JSON.stringify(selected.evidence, null, 2)}</pre></details>{allowed.length > 0 && <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget), payload: Row = { status: f.get('status') }; if (f.get('implementedAt'))
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
} }}><h3>{t("复检证据与效果")}</h3><label>{t("复检开始日期")}<input type="date" name="start" required/></label><label>{t("复检结束日期")}<input type="date" name="end" required/></label><label>{t("干扰因素（每行一个，必填）")}<textarea name="confounders" required placeholder={t("流量波动、季节性、同期其他改动")}/></label><p>{t("前后变化仅为观察性对照，不能据此证明优化有效。")}</p><button>{t("执行复检")}</button></form>}{selected.recheck && <details open><summary>{t("已保存复检证据")}</summary><pre>{JSON.stringify(selected.recheck, null, 2)}</pre></details>}</>}{result && <pre role="status">{JSON.stringify(result, null, 2)}</pre>}{error && <p role="alert" className="error">{error}</p>}</section></>; }
type Field = [
    string,
    string,
    string?
];
function Action({ title, endpoint, method = 'POST', fields, onSaved }: {
    title: string;
    endpoint: string;
    method?: string;
    fields: Field[];
    onSaved: () => void;
}) { const [result, setResult] = useState<Row>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); return <section className="panel"><h2>{t(title)}</h2><form onSubmit={async (e) => { e.preventDefault(); if (endpoint.endsWith('/delete-visitor') && !window.confirm(t('此操作永久删除所指定访客的明细并阻止重建。确认继续？')))
    return; setBusy(true); setError(''); try {
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
