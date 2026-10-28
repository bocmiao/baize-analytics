import { t, language } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { createReplayPlayer, replaySessions } from '../../packages/tracker/player';
import type { Row } from './api';
export default function ReplayViewer({ chunks }: {
    chunks: Row[];
}) { const sessions = replaySessions(chunks as {
    session_id: string;
    seq: number;
    payload: unknown[];
}[]); const [path, setPath] = useState(''); const paths=[...new Set(chunks.map(row=>String(row.path||'unknown')))]; const visibleSessions=sessions.filter(value=>!path||chunks.some(row=>row.session_id===value.id&&String(row.path||'unknown')===path)); const [selected, setSelected] = useState(''); const ref = useRef<HTMLDivElement>(null); const [error, setError] = useState(''); const session = visibleSessions.find(s => s.id === selected)||visibleSessions[0]; const metadata=chunks.find(row=>row.session_id===session?.id); useEffect(() => { if (!ref.current || !session)
    return; try {
    const player = createReplayPlayer(ref.current, session.events,{language:language()==='en'?'en':'zh-CN'});
    setError('');
    return () => player.destroy();
}
catch (err) {
    setError((err as Error).message);
} }, [session?.id, chunks]); return <section className="panel"><h2>{t("脱敏会话回放")}</h2><p>{t("回放是遮罩后的 DOM。脚本、远端资源和表单值都不会恢复。站点打开采集后才有数据。")}</p><p>{t('每个页面实例单独播放。最多 1000 个片段，范围大时请缩短日期。')}</p><label>{t('回放页面路径')}<select value={path} onChange={e=>{setPath(e.target.value);setSelected('');}}><option value="">{t('全部页面')}</option>{paths.map(value=><option key={value}>{value}</option>)}</select></label><label>{t("选择已采集会话")}<select value={session?.id||''} onChange={e => setSelected(e.target.value)}>{visibleSessions.map(s => <option value={s.id} key={s.id}>{s.id} · {s.events.length}{t("条片段")}</option>)}</select></label>{metadata&&<p className="replay-metadata">{t('页面实例')}：{String(metadata.page_id||'—')} · {t('页面')}：{String(metadata.path||'unknown')} · {t('开始')}：{String(metadata.started_at||'—')} · {t('结束')}：{String(metadata.ended_at||'—')}</p>}{!visibleSessions.length&&<p>{t('这个范围没有数据。')}</p>}{error && <p role="alert" className="error">{error}</p>}<div ref={ref}/></section>; }
