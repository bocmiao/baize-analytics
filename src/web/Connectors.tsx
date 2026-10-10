import { t,language } from './i18n';
import { useState, type FormEvent } from 'react';
import { api, type Row } from './api';
export function ModelSettings({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) {
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget); const settings: Row = { endpoint: String(f.get('endpoint')), model: String(f.get('model')), enabled: f.get('enabled') === 'on', monthlyTokenBudget: Number(f.get('budget')), maxTokens: 1024, dailyReport: f.get('dailyReport') === 'on' }; const localOrigin = String(f.get('localOrigin')); if (localOrigin)
        settings.localOrigin = localOrigin; try {
        await api(`/api/sites/${siteId}/external`, { kind: 'ai', secret: f.get('secret'), settings }, 'PUT');
        setSaved(true);
        onSaved();
    }
    catch (err) {
        setError((err as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel"><h2>{t("安全配置模型")}</h2><form onSubmit={submit}><label>{t("模型服务地址")}<input name="endpoint" type="url" required placeholder="https://api.openai.com/v1"/></label><label>{t("模型名称")}<input name="model" required placeholder={t("你的模型名称")}/></label><label>API Key<input name="secret" type="password" required autoComplete="off"/></label><label>{t("每月 Token 预算")}<input name="budget" type="number" defaultValue={100000} min={1} max={100000000} required/></label><label className="checkbox"><input name="enabled" type="checkbox"/>{t("启用聚合数据发送到该服务")}</label><label className="checkbox"><input name="dailyReport" type="checkbox"/>{t("生成每日聚合解读")}</label><details><summary>{t("本地模型受控例外（实例管理员）")}</summary><p>{t("登记模型专属精确 origin，仅作用于模型调用，不能用于爬虫。")}</p><label>{t("允许的本地 Origin")}<input name="localOrigin" type="url" placeholder="http://ollama:11434"/></label></details><button disabled={busy}>{busy ? t('正在加密保存…') : t('保存模型连接')}</button></form>{error && <p role="alert" className="error">{error}</p>}{saved && <p role="status">{t("模型设置已加密保存。密钥不会回显。")}</p>}</section>;
}
export function GoogleSettings({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) {
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    return <section className="panel"><h2>{t("Google 授权设置")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const settings: Row = { clientId: f.get('clientId'), redirectUri: `${location.origin}/api/google/callback` }; if (f.get('property'))
        settings.property = f.get('property'); if (f.get('gaProperty'))
        settings.gaProperty = f.get('gaProperty'); settings.dailyGa4=f.get('dailyGa4')==='on'; try {
        await api(`/api/sites/${siteId}/external`, { kind: 'google', secret: JSON.stringify({ clientSecret: f.get('clientSecret') }), settings }, 'PUT');
        setSaved(true);
        onSaved();
    }
    catch (err) {
        setError((err as Error).message);
    } }}><label>OAuth Client ID<input name="clientId" required/></label><label>OAuth Client Secret<input name="clientSecret" type="password" required autoComplete="off"/></label><label>{t("GSC 已验证资源")}<input name="property" placeholder="sc-domain:example.com"/></label><label>{t("GA4 属性 ID")}<input name="gaProperty" pattern="[0-9]+" placeholder="123456789"/></label><label className="check"><input type="checkbox" name="dailyGa4"/>{language()==='en'?'Opt in to daily GA4 import of the previous site-calendar day (provider timezone shown separately)':'启用每天导入上一站点日的 GA4 历史（另行显示提供商时区）'}</label><p>{t("在 Google 控制台登记回调地址：")}<code>{location.origin}/api/google/callback</code></p><button>{t("加密保存 Google 设置")}</button></form>{error && <p role="alert" className="error">{error}</p>}{saved && <p role="status">{t("设置已保存，可连接 Google 账号。")}</p>}</section>;
}
export function GoalEditor({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) { const [type, setType] = useState('event'); const [error, setError] = useState(''); return <section className="panel"><h2>{t("创建转化目标")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const value = String(f.get('value')); try {
    await api(`/api/v1/sites/${siteId}/goals`, { name: f.get('name'), type, config: type === 'event' ? { event_name: value } : type === 'page' ? { path: value } : { seconds: Number(value) } });
    onSaved();
    e.currentTarget.reset();
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("目标名称")}<input name="name" required/></label><label>{t("目标类型")}<select value={type} onChange={e => setType(e.target.value)}><option value="event">{t("触发自定义事件")}</option><option value="page">{t("到达页面")}</option><option value="duration">{t("会话达到时长")}</option></select></label><label>{type === 'event' ? t('事件名称') : type === 'page' ? t('页面路径') : t('时长秒数')}<input name="value" required type={type === 'duration' ? 'number' : 'text'} min={type === 'duration' ? 1 : undefined}/></label><button>{t("保存目标")}</button></form>{error && <p className="error" role="alert">{error}</p>}</section>; }
export function FunnelEditor({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) { const [steps, setSteps] = useState([{ type: 'page', value: '' }, { type: 'page', value: '' }]); const [error, setError] = useState(''); return <section className="panel"><h2>{t("创建有序漏斗")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try {
    await api(`/api/v1/sites/${siteId}/funnels`, { name: f.get('name'), steps, strict: f.get('strict') === 'on' });
    onSaved();
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("漏斗名称")}<input name="name" required/></label>{steps.map((step, index) => <div className="funnel-step" key={index}><label>{t("步骤")}{index + 1}<select value={step.type} onChange={e => setSteps(steps.map((s, i) => i === index ? { ...s, type: e.target.value } : s))}><option value="page">{t("到达页面")}</option><option value="event">{t("触发事件")}</option></select></label><label>{t("路径或事件名")}<input value={step.value} required onChange={e => setSteps(steps.map((s, i) => i === index ? { ...s, value: e.target.value } : s))}/></label></div>)}<button type="button" className="secondary" onClick={() => setSteps([...steps, { type: 'page', value: '' }])}>{t("＋ 添加步骤")}</button><label className="checkbox"><input type="checkbox" name="strict" defaultChecked/>{t("严格顺序，须从第一步进入")}</label><button>{t("保存漏斗")}</button></form>{error && <p className="error" role="alert">{error}</p>}</section>; }
export function SavedReport({ siteId, from, to, onSaved }: {
    siteId: string;
    from: string;
    to: string;
    onSaved: () => void;
}) { const [error, setError] = useState(''); return <section className="panel"><h2>{t("保存当前筛选为报表")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const dsl: Row = { from, to }; if (f.get('path'))
    dsl.path = f.get('path'); if (f.get('channel'))
    dsl.channel = f.get('channel'); try {
    await api(`/api/v1/sites/${siteId}/reports`, { name: f.get('name'), dsl });
    onSaved();
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("报表名称")}<input name="name" required/></label><label>{t("限定页面（可选）")}<input name="path" placeholder="/pricing"/></label><label>{t("限定渠道（可选）")}<select name="channel"><option value="">{t("所有渠道")}</option><option value="direct">{t("直接访问")}</option><option value="search">{t("搜索引擎")}</option><option value="social">{t("社交媒体")}</option><option value="ai">{t("AI 引荐")}</option></select></label><p>{t("日期范围：")}{from.slice(0, 10)}{t("至")}{to.slice(0, 10)}</p><button>{t("保存筛选报表")}</button></form>{error && <p role="alert" className="error">{error}</p>}</section>; }
export function ShareEditor({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) { const [result, setResult] = useState(''); const [error, setError] = useState(''); return <section className="panel"><h2>{t("创建只读分享")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget), payload: Row = { frame_origins: String(f.get('frame_origins')).split('\n').map(s => s.trim()).filter(Boolean) }; if (f.get('password'))
    payload.password = f.get('password'); if (f.get('expires_at'))
    payload.expires_at = new Date(String(f.get('expires_at'))).toISOString(); try {
    const r = await api<{
        url: string;
    }>(`/api/v1/sites/${siteId}/shares`, payload);
    setResult(r.url);
    onSaved();
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("访问密码（可选，至少 8 位）")}<input name="password" type="password" minLength={8}/></label><label>{t("失效时间（可选）")}<input name="expires_at" type="datetime-local"/></label><details><summary>{t("图表嵌入安全设置")}</summary><label>{t("允许嵌入的 Origin（每行一个）")}<textarea name="frame_origins" placeholder="https://my-admin.example.com"/></label></details><button>{t("生成只读链接")}</button></form>{result && <p role="status">{t("仅此一次显示分享链接：")}<a href={result}>{result}</a></p>}{error && <p role="alert" className="error">{error}</p>}</section>; }
export function InviteEditor({ siteId, onSaved }: {
    siteId: string;
    onSaved: () => void;
}) { const [result, setResult] = useState(''); const [error, setError] = useState(''); return <section className="panel"><h2>{t("邀请成员")}</h2><form onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); try {
    const r = await api<{
        url: string;
    }>(`/api/v1/sites/${siteId}/invites`, f);
    setResult(r.url);
    onSaved();
}
catch (err) {
    setError((err as Error).message);
} }}><label>{t("成员邮箱")}<input name="email" type="email" required/></label><label>{t("站点角色")}<select name="role"><option value="viewer">{t("只读 · 仅查看分析")}</option><option value="analyst">{t("分析师 · 编辑目标与报表")}</option><option value="admin">{t("管理员 · 站点治理")}</option></select></label><button>{t("生成邀请链接")}</button></form>{result && <p role="status">{t("将此链接发送给成员：")}<a href={result}>{result}</a></p>}{error && <p role="alert" className="error">{error}</p>}</section>; }
export function PrivacyFeatures({ siteId, initial = {}, onSaved }: {
    siteId: string;
    initial?: Row;
    onSaved: () => void;
}) { const [error, setError] = useState(''); return <section className="panel"><h2>{t("按需采集与隐私开关")}</h2><p>{t("回放、热图、实验仅在明确启用后采集；请先在被统计网站部署访客同意入口。关闭后不会采集新数据。")}</p><form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const config: Row = { session_timeout_minutes:Number(f.get('session_timeout_minutes')||30),seoAutoScan:f.get('seoAutoScan')==='on',consent_required: ['consent_required', 'replay', 'heatmap', 'experiments'].some(k => f.get(k) === 'on'), replay: f.get('replay') === 'on', heatmap: f.get('heatmap') === 'on', vitals: f.get('vitals') === 'on', experiments: f.get('experiments') === 'on', excluded_ips: String(f.get('excluded_ips')).split('\n').map(s => s.trim()).filter(Boolean) }; try {
    await api(`/api/v1/sites/${siteId}`, { config }, 'PATCH');
    onSaved();
    setError(t("已保存，新的追踪脚本加载将读取更新后的配置。"));
}
catch (err) {
    setError((err as Error).message);
} }}>{[['consent_required', '未同意不采集'], ['vitals', '官方 Web Vitals 采集'], ['replay', '经过遮罩的结构回放'], ['heatmap', t('匿名点击热图')], ['experiments', '明确同意后的实验归因']].map(([key, label]) => <label className="checkbox" key={key}><input name={key} type="checkbox" defaultChecked={initial[key] === true}/>{label}</label>)}<label>{t("会话无活动超时（分钟）")}<input name="session_timeout_minutes" type="number" min={1} max={1440} defaultValue={Number(initial.session_timeout_minutes||30)} required/></label><label className="checkbox"><input name="seoAutoScan" type="checkbox" defaultChecked={initial.seoAutoScan===true}/>{t("每日自动扫描已授权域名 SEO（受限出站，不扫描其他域名）")}</label><label>{t("内部 IP 排除（CIDR，每行一个）")}<textarea name="excluded_ips" defaultValue={Array.isArray(initial.excluded_ips) ? initial.excluded_ips.join('\n') : ''} placeholder="10.0.0.0/8"/></label><button>{t("保存采集与排除设置")}</button></form>{error && <p role="status">{error}</p>}</section>; }
export function RankSettings({siteId,onSaved}:{siteId:string;onSaved:()=>void}){const[provider,setProvider]=useState('serpapi'),[error,setError]=useState('');return <section className="panel"><h2>{t("关键词排名数据源")}</h2><p>{t("外部 SERP 请求可能产生费用，费用由部署者承担。不购买或代建账号。默认 Google/美国/英语范围，实际供应商覆盖可能有限。")}</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/api/sites/${siteId}/external`,{kind:provider,secret:f.get('secret'),settings:{daily:f.get('daily')==='on',keywords:String(f.get('keywords')).split('\n').map(s=>s.trim()).filter(Boolean)}},'PUT');onSaved();setError(t("加密设置已保存。"));}catch(err){setError((err as Error).message);}}}><label>{t("数据提供方")}<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="serpapi">SerpAPI</option><option value="dataforseo">DataForSEO</option></select></label><label>{provider==='serpapi'?'API Key':t('API 用户名:密码')}<input name="secret" type="password" required autoComplete="off"/></label><label>{t("监控关键词（每行一个）")}<textarea name="keywords" required/></label><label className="checkbox"><input name="daily" type="checkbox"/>{t("启用每日外部查询（可能产生费用）")}</label><button>{t("保存排名连接器")}</button></form>{error&&<p role="status">{error}</p>}</section>;}
export function AskAnalytics({siteId,start,end,onSaved}:{siteId:string;start:string;end:string;onSaved:()=>void}){const [purpose,setPurpose]=useState('question'),[result,setResult]=useState<Row>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);return <section className="panel"><h2>{t("基于授权聚合数据问数")}</h2><p>{t("范围：")}{start}{t("至")}{end}{t("。模型只能调用本账号可访问的只读语义工具，不能执行 SQL。外部模型输出可能出错，请核对证据。")}</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const f=new FormData(e.currentTarget);setResult(await api<Row>(`/api/sites/${siteId}/ai`,{purpose,question:f.get('question')||t('解读聚合指标并明确证据和不确定性'),start,end}));onSaved();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}><label>{t("用途")}<select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="question">{t("自然语言问数")}</option><option value="daily">{t("生成数据解读")}</option><option value="anomaly">{t("异常变化归因假设")}</option><option value="suggestions">{t("生成证据关联优化建议")}</option></select></label><label>{t("问题")}<textarea name="question" maxLength={2000} required={purpose==='question'} placeholder={t("例如：所选期间微信来源的 iOS 用户转化率是多少？")}/></label><button disabled={busy}>{busy?t('正在查阅授权数据…'):t('查询并解释证据')}</button></form>{error&&<p role="alert" className="error">{error}</p>}{result&&<><h3>{t("回答")}</h3><p className="ai-answer">{String(result.answer||'')}</p><p>{t("证据 ID：")}{String(result.id)}{t("· 记录 Token：")}{String(result.tokens)}{t("（非提供商账单保证）")}</p><p>{String(result.privacy||'')} {String(result.causality||'')}</p><details><summary>{t("核对返回的聚合证据")}</summary><pre>{JSON.stringify(result.evidence,null,2)}</pre></details></>}</section>;}
