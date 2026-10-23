import {useRef,useState,type ReactNode} from 'react';
import {language} from './i18n';

const label=(zh:string,en:string)=>language()==='en'?en:zh;

export function WorkspaceDateRange({from,to,onChange,onRefresh}:{from:string;to:string;onChange:(from:string,to:string)=>void;onRefresh:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [draftFrom,setDraftFrom]=useState(from),[draftTo,setDraftTo]=useState(to);
 function close(){dialog.current?.close();trigger.current?.focus();}
 function open(){setDraftFrom(from);setDraftTo(to);dialog.current?.showModal();}
 return <div className="workspace-date-picker">
  <button ref={trigger} type="button" className="secondary range-trigger" aria-haspopup="dialog" onClick={open} aria-label={`${label('选择日期范围','Choose date range')}: ${from} – ${to}`}>
   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18"/></svg>
   <span>{from.replaceAll('-','/')}<span className="range-divider">–</span>{to.replaceAll('-','/')}</span>
   <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>
  </button>
  <button type="button" className="secondary refresh-button" onClick={onRefresh} aria-label={label('刷新数据','Refresh data')} title={label('刷新数据','Refresh data')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-6L4 8M5 13a7 7 0 0 0 12 6l3-3"/></svg></button>
  <dialog ref={dialog} className="date-dialog" aria-labelledby="date-dialog-title" onCancel={event=>{event.preventDefault();close();}}>
   <form onSubmit={event=>{event.preventDefault();onChange(draftFrom,draftTo);close();}}>
    <div className="dialog-heading"><h2 id="date-dialog-title">{label('选择日期范围','Choose date range')}</h2><button type="button" className="secondary" onClick={close} aria-label={label('关闭日期选择','Close date picker')}>×</button></div>
    <p>{label('报表按站点时区统计，包含开始和结束当天。','Reports use the site time zone and include both selected days.')}</p>
    <div className="date-dialog-fields"><label>{label('开始日期','Start date')}<input autoFocus required type="date" value={draftFrom} max={draftTo||undefined} onChange={event=>setDraftFrom(event.target.value)} onInput={event=>setDraftFrom(event.currentTarget.value)}/></label><label>{label('结束日期','End date')}<input required type="date" value={draftTo} min={draftFrom||undefined} onChange={event=>setDraftTo(event.target.value)} onInput={event=>setDraftTo(event.currentTarget.value)}/></label></div>
    <div className="dialog-actions"><button type="button" className="secondary" onClick={close}>{label('取消','Cancel')}</button><button type="submit">{label('应用日期','Apply dates')}</button></div>
   </form>
  </dialog>
 </div>;
}

export function SettingsLayout({sections}:{sections:{id:string;title:string;description:string;content:ReactNode}[]}){
 const [selected,setSelected]=useState(sections[0]?.id),buttons=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className="settings-layout">
  <div className="settings-tabs" role="tablist" aria-label={label('站点设置分区','Site settings sections')}>
   {sections.map((section,index)=><button key={section.id} ref={element=>{buttons.current[index]=element;}} id={`setting-tab-${section.id}`} role="tab" type="button" aria-selected={selected===section.id} aria-controls={`setting-panel-${section.id}`} tabIndex={selected===section.id?0:-1} onClick={()=>setSelected(section.id)} onKeyDown={event=>{const offset=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;const next=event.key==='Home'?0:event.key==='End'?sections.length-1:offset?(index+offset+sections.length)%sections.length:-1;if(next>=0){event.preventDefault();setSelected(sections[next]!.id);buttons.current[next]?.focus();}}}>{section.title}</button>)}
  </div>
  {sections.map(section=><section key={section.id} id={`setting-panel-${section.id}`} role="tabpanel" aria-labelledby={`setting-tab-${section.id}`} hidden={selected!==section.id} className="settings-content"><header><h2>{section.title}</h2><p>{section.description}</p></header>{section.content}</section>)}
 </div>;
}

const descriptions:Record<string,[string,string]>={
 overview:['了解访问表现，找到值得继续追踪的变化。','Understand traffic and discover what deserves a closer look.'],
 realtime:['查看当前活跃访客和最近的访问。','Follow active visitors and recent activity.'],
 pages:['哪些内容被看见，访客在哪里停留。','See which pages attract visits and attention.'],
 sources:['了解访客从哪里来，以及各渠道的表现。','Understand how visitors discover your site.'],
 audience:['从设备、浏览器和地域理解你的受众。','Explore your audience by device, browser and geography.'],
 events:['查看访客行为及事件属性。','Explore visitor actions and event properties.'],
 settings:['管理站点信息、采集方式和运行设置。','Manage site details, collection and operation.'],
 goals:['定义有价值的行为，衡量转化表现。','Define valuable actions and measure conversions.'],
 funnels:['找到转化路径中访客离开的步骤。','Discover where visitors leave your conversion path.'],
 ai:['围绕当前报表提问，查看有数据依据的分析。','Ask questions grounded in your current reports.'],
 members:['管理可以访问此站点的成员与权限。','Manage access to this site.'],
 gsc:['了解搜索曝光、点击和关键词表现。','Understand search impressions, clicks and queries.'],
 seo:['检查网站内容，追踪搜索优化进展。','Inspect site content and track search improvements.'],
};
export function reportDescription(report:string){const value=descriptions[report];return value?.[language()==='en'?1:0]||'';}
