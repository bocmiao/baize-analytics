/** Explicit opt-in analytical replica. PostgreSQL remains the source of truth. */
export interface AnalyticsRow {site_id:string;event_id:string;ts:string;type:string;path:string;visitor_id:string|null;generation:number}
export interface ClickHouseConfig {url:string;username:string;password:string;enabled:boolean;fetch?:typeof fetch}
export class ClickHouseReplica {
  constructor(private readonly config:ClickHouseConfig) {
    const url=new URL(config.url);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid ClickHouse URL');
  }
  private async request(query:string,body?:string) {
    if(!this.config.enabled)throw Error('ClickHouse replica is disabled');
    const url=new URL(this.config.url);url.searchParams.set('query',query);url.searchParams.set('date_time_input_format','best_effort');
    const response=await (this.config.fetch??fetch)(url,{method:'POST',headers:{'X-ClickHouse-User':this.config.username,'X-ClickHouse-Key':this.config.password,'Content-Type':'application/x-ndjson'},body,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`ClickHouse request failed (${response.status})`);
    return response;
  }
  async initialize() {await this.request('CREATE TABLE IF NOT EXISTS baize_events (site_id String,event_id String,ts DateTime64(3),type LowCardinality(String),path String,visitor_id Nullable(String),generation UInt64) ENGINE=ReplacingMergeTree(generation) ORDER BY (site_id,event_id)');}
  async export(rows:AnalyticsRow[]) {if(rows.length>1000)throw Error('Batch exceeds 1000');await this.request('INSERT INTO baize_events FORMAT JSONEachRow',rows.map(r=>JSON.stringify(r)).join('\n'));}
  async counts(siteId:string,from:string,to:string) {
    // Bound typed parameters; no caller-supplied SQL or identifier interpolation.
    const query='SELECT type,count() AS count FROM baize_events FINAL WHERE site_id={site:String} AND ts>={from:DateTime64(3)} AND ts<{to:DateTime64(3)} GROUP BY type FORMAT JSON';
    const url=new URL(this.config.url);url.searchParams.set('param_site',siteId);url.searchParams.set('param_from',from);url.searchParams.set('param_to',to);
    const replica=new ClickHouseReplica({...this.config,url:url.href});
    return (await replica.request(query)).json();
  }
  async deleteVisitor(siteId:string,visitorId:string) {
    const url=new URL(this.config.url);url.searchParams.set('param_site',siteId);url.searchParams.set('param_visitor',visitorId);
    await new ClickHouseReplica({...this.config,url:url.href}).request('ALTER TABLE baize_events DELETE WHERE site_id={site:String} AND visitor_id={visitor:String} SETTINGS mutations_sync=2');
  }
}
