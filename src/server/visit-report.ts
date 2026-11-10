import type {VisitRow} from './51la-report-model.js';
export const visitSortKeys=['time','visitorKey','visitorType','country','region','city','ipLabel','isp','browser','referrer','entry','keyword','pageviews','duration'] as const;
export type VisitSortKey=typeof visitSortKeys[number];
export const MAX_VISIT_EXPORT_ROWS=10000;
export function sortVisitRows(rows:VisitRow[],sort:VisitSortKey='time',direction:'asc'|'desc'='desc'){
 const sign=direction==='asc'?1:-1;
 return [...rows].sort((a,b)=>{const left=a[sort],right=b[sort];if(left==null||right==null)return left==null&&right==null?a.id.localeCompare(b.id):left==null?1:-1;const order=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right),'zh-CN');return order*sign||a.id.localeCompare(b.id);});
}
/** Entire matching set, never an invisible page or truncated sample. */
export function visitReportCsv(rows:VisitRow[],timezone:string){
 if(rows.length>MAX_VISIT_EXPORT_ROWS)throw Object.assign(new Error(`筛选结果超过 ${MAX_VISIT_EXPORT_ROWS} 条，请缩小日期或筛选范围后下载。`),{statusCode:413});
 const quote=(value:unknown)=>{let text=String(value??'');if(/^[\s\uFEFF]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const types={new:'新访客',returning:'老访客',unknown:'未知'};
 const cells=[['访问时间（'+timezone+'）','访客标识','访客类型','国家 / 地区','省 / 区域','城市','IP标识（脱敏）','运营商','浏览器','来路网站','入口页面','关键词','浏览页数','访问时长（秒）','访问路径'],...rows.map(row=>[format.format(new Date(row.time)),row.visitorKey,types[row.visitorType],row.country,row.region,row.city,row.ipLabel,row.isp,row.browser,row.referrer,row.entry,row.keyword,row.pageviews,row.duration,row.paths.map(path=>format.format(new Date(path.time))+' '+path.path).join('\n')])];
 const csv='\uFEFF'+cells.map(row=>row.map(quote).join(',')).join('\r\n');
 if(Buffer.byteLength(csv)>8*1024*1024)throw Object.assign(new Error('下载内容超过 8 MB，请缩小日期或筛选范围。'),{statusCode:413});
 return csv;
}
