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
}[]); const [selected, setSelected] = useState(''); const ref = useRef<HTMLDivElement>(null); const [error, setError] = useState(''); const session = sessions.find(s => s.id === (selected || sessions[0]?.id)); useEffect(() => { if (!ref.current || !session)
    return; try {
    const player = createReplayPlayer(ref.current, session.events,{language:language()==='en'?'en':'zh-CN'});
    setError('');
    return () => player.destroy();
}
catch (err) {
    setError((err as Error).message);
} }, [session?.id, chunks]); return <section className="panel"><h2>{t("脱敏会话回放")}</h2><p>{t("结构回放仅展示经过遮罩的 DOM。脚本、远端资源和表单值均不可执行或恢复。此模块仅在站点已明确启用采集时有数据。")}</p><label>{t("选择已采集会话")}<select value={selected || sessions[0]?.id || ''} onChange={e => setSelected(e.target.value)}>{sessions.map(s => <option value={s.id} key={s.id}>{s.id} · {s.events.length}{t("条片段")}</option>)}</select></label>{error && <p role="alert" className="error">{error}</p>}<div ref={ref}/></section>; }
