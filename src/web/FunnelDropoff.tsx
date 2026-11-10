import {ReportDisclosure} from './DensePrimitives';
import { useEffect, useState } from 'react';
import { api, rows, type Row } from './api';
import { DataTable } from './RevenueIdentityViews';
import { dashboardFilterKeys } from './DashboardFilters';
import { t } from './i18n';
import {stableIdentityKey} from '../../packages/tracker/src/privacy';
const states: Record<string, string> = {
    supported: '完整保留明细', unsupported_in_this_mode: '每日匿名模式不支持跨日漏斗', outside_raw_retention: '超出明细保留期', outside_bounded_context: '会话记录不完整', event_limit_exceeded: '记录超出查询上限', partial_session_context: '会话边界记录不完整', future_only: '所选时间尚未发生', unsupported_filters: '流失特征不支持当前站内筛选',
};
export function FunnelDropoff({ siteId, query, funnels }: { siteId: string; query: string; funnels: Row[] }) {
    const [selected, setSelected] = useState(''), [property, setProperty] = useState('');
    const [data, setData] = useState<Row>({}), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const [range, setRange] = useState({ from: '', requestedTo: '', effectiveTo: '', clamped: false });
    const funnel = funnels.find(row => row.id === selected) || funnels[0];
    const id = String(funnel?.id || '');
    useEffect(() => {
        const controller = new AbortController(); let active = true;
        const params = new URLSearchParams(query), from = params.get('from') || '', requestedTo = params.get('to') || '';
        const effectiveTo = new Date(Math.min(Date.now(), +new Date(requestedTo))).toISOString();
        setRange({ from, requestedTo, effectiveTo, clamped: +new Date(requestedTo) > +new Date(effectiveTo) });
        setData({}); setError(''); setLoading(false);
        if (!id) return () => { active = false; controller.abort(); };
        if (+new Date(from) >= +new Date(effectiveTo)) { setData({ status: 'future_only', coverage: 0 }); return () => { active = false; controller.abort(); }; }
        if (dashboardFilterKeys.some(key => params.get(key))) { setData({ status: 'unsupported_filters', coverage: 0 }); return () => { active = false; controller.abort(); }; }
        const request = new URLSearchParams({ from, to: effectiveTo }); if (property) request.set('property', property);
        setLoading(true);
        void api<Row>(`/api/v1/sites/${siteId}/funnels/${id}/analysis?${request}`, undefined, 'GET', controller.signal).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [siteId, id, query, property]);
    const complete = data.status === 'supported' && data.coverage === 1 && !data.truncated;
    return <section className="panel funnel-dropoff-analysis"><h2>{t('流失访客分析')}</h2><ReportDisclosure title={t('统计口径')}><p>{t('统计在同一次访问中到达当前步骤、但未到达下一步的访客。')}</p></ReportDisclosure><label>{t('选择流失分析漏斗')}<select value={id} onChange={e => setSelected(e.target.value)}>{funnels.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label><form onSubmit={e => { e.preventDefault(); const value=String(new FormData(e.currentTarget).get('property') || '').trim();if(value&&stableIdentityKey(value)){setError(t('流失维度不含身份字段。'));return;}setError('');setProperty(value); }}><label>{t('事件属性（可选）')}<input name="property" maxLength={64} placeholder="plan"/></label><button>{t('分析流失属性')}</button></form><ReportDisclosure title={t('属性统计说明')}><p>{t('取首次到达该步骤时的事件属性，缺值单独统计，不包含身份字段。')}</p></ReportDisclosure>{loading && <p role="status">{t('正在读取…')}</p>}{error && <p className="error" role="alert">{error}</p>}<ReportDisclosure title={t('数据范围')}><p>{t('请求结束时间')}：{range.requestedTo || '—'}</p><p>{t('实际结束时间')}：{range.effectiveTo || '—'}</p><p>{t('覆盖率')}：{Math.round(Number(data.coverage || 0) * 100)}% · {t('更新时间')}：{String(data.watermark || '—')}</p></ReportDisclosure>{range.clamped && <p className="notice">{t('今天截到当前时间。')}</p>}{Boolean(data.status) && !complete && <p className="notice" role="status">{t(states[String(data.status)] || '当前范围无法完成流失分析')}</p>}{Boolean(data.truncated) && <p className="notice">{t('事件超过上限，不返回截断统计。')}</p>}{complete && <><ReportDisclosure title={t('分析范围')}><p>{t('明细事件数')}：{String(data.observedEvents)} · {t('记录上限')}：{String(data.eventLimit)} · {t('各维度最多项数')}：{String(data.dimensionLimit)}</p></ReportDisclosure>{rows(data.steps).map(step => <article key={String(step.step)} className="funnel-dropoff-step"><h3>{t('步骤')} {Number(step.step) + 1} · {t('进入')} {String(step.entered)} · {t('流失')} {String(step.lost)}</h3><p>{t('流失率')}：{(Number(step.lossRate) * 100).toFixed(2)}% · {t('下一步到达访客')}：{String(step.completed)}</p><h4>{t('流失来源 Top')}</h4><DataTable data={rows(step.sources)} columns={{ value: '渠道', count: '流失人数' }}/><h4>{t('流失设备 Top')}</h4><DataTable data={rows(step.devices)} columns={{ value: '设备', count: '流失人数' }}/>{property && <><h4>{t('流失属性 Top')}：{property}</h4><p>{t('有属性样本')}：{String(step.propertySamples)} · {t('缺失属性样本')}：{String(step.missingPropertySamples)}</p><DataTable data={rows(step.properties)} columns={{ type: '属性类型', value: '属性值', count: '流失人数' }}/></>}</article>)}</>}</section>;
}
