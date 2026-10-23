import { api, type Row, rows } from './api';
import {useState} from 'react';
import { t } from './i18n';
function percentage(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—'; }
export function ExperimentResults({ experiments, siteId, canAdmin, onSaved }: { experiments: Row[]; siteId:string; canAdmin:boolean; onSaved:()=>void }) {
    const [error,setError]=useState('');
    const groups = [...new Set(experiments.map(row => String(row.id)))];
    return <section className="panel"><h2>{t('固定周期实验比较')}</h2>{error&&<p role="alert" className="error">{error}</p>}{!groups.length && <p>{t('选定范围尚无实际数据。')}</p>}{groups.map(id => {
        const variants = experiments.filter(row => String(row.id) === id);
        const definition = variants[0]!;
        return <section key={id}><h3>{String(definition.name)}</h3><p>{t('真实转化事件名称')}：{String(definition.goal)} · {t('实验状态')}：{t(definition.enabled ? '采集中' : '已停止分配')}</p>{canAdmin&&<button className="secondary" onClick={()=>void api(`/api/v1/sites/${siteId}/experiments/${id}`,{enabled:!definition.enabled},'PATCH').then(()=>{setError('');onSaved();}).catch(e=>setError(e.message))}>{t(definition.enabled?'停止新访客分配':'继续访客分配')}</button>}<div className="table-wrap"><table><thead><tr>{['变体', '分配访客', '转化访客', '转化率', '绝对提升', '相对提升', '转化率 95% 区间', 'p 值', '统计状态'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{variants.map((variant, i) => {
            const comparison = (variant.comparison || {}) as Row;
            const interval = Array.isArray(comparison.confidence_interval) ? comparison.confidence_interval : [];
            const insufficient = comparison.status !== 'eligible_fixed_horizon';
            return <tr key={i}><td>{String(variant.variant || '—')}{variant.variant === variant.control_variant && ` (${t('对照组')})`}</td><td>{String(variant.visitors)}</td><td>{String(variant.conversions)}</td><td>{percentage(Number(variant.visitors) ? Number(variant.conversions) / Number(variant.visitors) : null)}</td><td>{insufficient ? '—' : percentage(comparison.absolute_lift)}</td><td>{insufficient ? '—' : percentage(comparison.relative_lift)}</td><td>{!insufficient && interval.length === 2 ? `${percentage(interval[0])} — ${percentage(interval[1])}` : '—'}</td><td>{!insufficient && typeof comparison.p_value === 'number' ? comparison.p_value.toPrecision(3) : '—'}</td><td>{t(comparison.status === 'partial_history_unavailable' ? '历史不完整' : insufficient ? '样本不足' : comparison.significant ? '固定周期阈值达成' : '未达显著阈值')}</td></tr>;
        })}</tbody></table></div>{variants.some(row => (row.comparison as Row)?.status === 'partial_history_unavailable') && <p className="notice">{t('旧转换标记缺少可重建的原始事件，历史不完整；仅显示可核验贡献，不生成显著性结论。')}</p>}{variants.some(row => (row.comparison as Row)?.status === 'insufficient_sample') && <p className="notice">{t('实际分配或转化样本不足，不生成显著性结论。')}</p>}<details><summary>{t('统计方法与限制')}</summary>{variants.flatMap(row => rows((row.comparison as Row)?.limitations)).map((value, i) => <p key={i}>{String(value)}</p>)}<p>{String((definition.comparison as Row)?.method || '—')}</p><p>{t('区间为该变体转化率的 Wilson 95% 区间，不是提升幅度区间；绝对提升以百分点解释，相对提升不适用于零转化对照组。多变体 p 值采用服务端校正。')}</p></details></section>;
    })}</section>;
}
