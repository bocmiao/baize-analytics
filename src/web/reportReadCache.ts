export type ReportReadInvalidation = 'refresh' | 'mutation' | 'session' | 'identity';
type Loader<T> = (signal: AbortSignal) => Promise<T>;
type Consumer = {resolve: (value: unknown) => void; reject: (error: unknown) => void; detach: () => void};
type Flight = {path: string; controller: AbortController; consumers: Set<Consumer>; revision: number; refreshKey?: string | number};
type Cached = {value: unknown; expiresAt: number};

function aborted(): DOMException {return new DOMException('The report read was cancelled.', 'AbortError');}

/** Only a short forward tick of an unchanged real-time window may retain its last rendered result. */
export function continuesReportWindow(previousPath: string | null, nextPath: string | null): boolean {
 if(!previousPath || !nextPath)return false;
 try{
  const previous=new URL(previousPath,'http://report.local'),next=new URL(nextPath,'http://report.local');
  if(previous.origin!==next.origin || previous.pathname!==next.pathname || !/^\/api\/v1\/sites\/[^/]+\/(traffic-report|visits)$/.test(next.pathname))return false;
  const times=[previous,next].map(url=>['from','to'].map(key=>url.searchParams.getAll(key).length===1?Date.parse(url.searchParams.get(key)!):NaN));
  const [[from,to],[nextFrom,nextTo]]=times as [[number,number],[number,number]];
  if(![from,to,nextFrom,nextTo].every(Number.isFinite) || to<=from || nextTo-nextFrom!==to-from || nextFrom<=from || nextFrom-from>60_000)return false;
  for(const url of [previous,next]){url.searchParams.delete('from');url.searchParams.delete('to');}
  return previous.search===next.search;
 }catch{return false;}
}

/** Session-local, exact-URL reads. Responses are retained by reference, including API WeakMap metadata. */
export class ReportReadCache {
 private readonly entries = new Map<string, Cached>();
 private readonly pending = new Map<string, Flight>();
 private readonly active = new Set<Flight>();
 private readonly listeners = new Set<(reason: ReportReadInvalidation) => void>();
 private identity: string | undefined;
 revision = 0;
 sessionRevision = 0;
 suspended = false;

 constructor(private readonly ttl = 10_000, private readonly capacity = 32, private readonly now = () => Date.now()) {}

 peek<T>(path: string): T | undefined {
  if(this.suspended || this.pending.has(path))return undefined;
  const cached = this.entries.get(path);
  if(!cached)return undefined;
  if(cached.expiresAt <= this.now()){this.entries.delete(path);return undefined;}
  return cached.value as T;
 }

 subscribe(listener: (reason: ReportReadInvalidation) => void): () => void {
  this.listeners.add(listener);return () => {this.listeners.delete(listener);};
 }

 invalidate(reason: ReportReadInvalidation = 'refresh'): void {
  this.revision++;
  if(reason === 'session' || reason === 'identity')this.sessionRevision++;
  if(reason === 'session'){this.suspended = true;this.identity = undefined;}
  this.entries.clear();this.pending.clear();
  for(const flight of [...this.active])this.cancel(flight);
  for(const listener of this.listeners)listener(reason);
 }

 identify(identity: string): void {
  if(this.suspended || this.identity !== undefined && this.identity !== identity){
   this.suspended = false;this.invalidate('identity');
  }
  this.identity = identity;
 }

 read<T>(path: string, loader: Loader<T>, options: {signal?: AbortSignal; force?: boolean; refreshKey?: string | number} = {}): Promise<T> {
  if(options.signal?.aborted || this.suspended)return Promise.reject(aborted());
  if(options.force)this.entries.delete(path);
  const cached = this.peek<T>(path);
  if(cached !== undefined){
   const revision = this.revision;
   const entry = this.entries.get(path)!;this.entries.delete(path);this.entries.set(path, entry);
   // Check cancellation again when a synchronous cache hit reaches its consumer.
   return Promise.resolve().then(() => {if(options.signal?.aborted || this.suspended || revision !== this.revision)throw aborted();return cached;});
  }
  let flight = this.pending.get(path);
  if(flight && options.force && (options.refreshKey === undefined || flight.refreshKey !== options.refreshKey))flight = undefined;
  const start = !flight;
  if(!flight){
   flight = {path, controller: new AbortController(), consumers: new Set(), revision: this.revision, refreshKey: options.force ? options.refreshKey : undefined};
   // Only the most recent request for a URL may populate the cache. Existing consumers keep their own read.
   this.pending.set(path, flight);this.active.add(flight);
   while(this.pending.size > this.capacity)this.pending.delete(this.pending.keys().next().value!);
  }
  const selected = flight;
  const result = new Promise<T>((resolve, reject) => {
   const cancel = () => {
    selected.consumers.delete(consumer);consumer.detach();reject(aborted());
    if(!selected.consumers.size)this.cancel(selected);
   };
   const consumer: Consumer = {resolve: value => resolve(value as T), reject, detach: () => options.signal?.removeEventListener('abort', cancel)};
   selected.consumers.add(consumer);options.signal?.addEventListener('abort', cancel, {once: true});
  });
  if(start){
   try{void loader(selected.controller.signal).then(value => this.finish(selected, true, value), error => this.finish(selected, false, error));}
   catch(error){this.finish(selected, false, error);}
  }
  return result.then(value => {
   if(options.signal?.aborted || selected.revision !== this.revision || this.suspended)throw aborted();
   return value;
  });
 }

 private cancel(flight: Flight): void {
  if(this.pending.get(flight.path) === flight)this.pending.delete(flight.path);
  this.active.delete(flight);flight.controller.abort();
  for(const consumer of flight.consumers){consumer.detach();consumer.reject(aborted());}
  flight.consumers.clear();
 }

 private finish(flight: Flight, success: boolean, value: unknown): void {
  if(!this.active.has(flight) || flight.controller.signal.aborted || flight.revision !== this.revision)return;
  const current = this.pending.get(flight.path) === flight;
  if(current)this.pending.delete(flight.path);
  this.active.delete(flight);
  if(success && current){
   const now = this.now();
   for(const [key, entry] of this.entries)if(entry.expiresAt <= now)this.entries.delete(key);
   this.entries.delete(flight.path);this.entries.set(flight.path, {value, expiresAt: now + this.ttl});
   while(this.entries.size > this.capacity)this.entries.delete(this.entries.keys().next().value!);
  }
  for(const consumer of flight.consumers){consumer.detach();if(success)consumer.resolve(value);else consumer.reject(value);}
  flight.consumers.clear();
 }
}

export const reportReadCache = new ReportReadCache();
export function invalidateReportReads(reason: ReportReadInvalidation = 'refresh'): void {reportReadCache.invalidate(reason);}
