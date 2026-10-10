/** MIT License. Copyright (c) 2026 Baize contributors. See ../LICENSE. */
/** Public transport shape; the AGPL server independently validates this protocol. */
export interface WireEventCore {
 event_id:string;page_id:string;ts:number;visitor_id:string|null;url:string;path:string;
 type:'pageview'|'event'|'heartbeat'|'vitals'|'revenue'|'identify'|'replay'|'heatmap'|'consent';
}
