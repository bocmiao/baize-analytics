import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {describe,it,expect} from 'vitest';
import {consumeClickHouseCommand} from '../../src/server/clickhouse-command-response.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {ClickHouseStore} from '../../src/server/clickhouse-store.js';
import {ClickHouseFactStore} from '../../src/server/fact-store.js';
import {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {ClickHouseCacheStore} from '../../src/server/cache-store.js';
import {ClickHouseSessionHeaderStore} from '../../src/server/session-header-store.js';
const factories=[CanonicalClickHouse,ClickHouseStore,ClickHouseFactStore,ClickHouseRemainingFactStore,ClickHouseCacheStore,ClickHouseSessionHeaderStore];
describe('ClickHouse complete command response',()=>{
 it('accepts empty or chunked ASCII whitespace only after EOF',async()=>{await consumeClickHouseCommand(new Response(null),'SAFE');let controller!:ReadableStreamDefaultController<Uint8Array>;const stream=new ReadableStream<Uint8Array>({start(c){controller=c;}});let complete=false;const pending=consumeClickHouseCommand(new Response(stream),'SAFE').then(()=>{complete=true;});controller.enqueue(new TextEncoder().encode(' \r\n\t'));await Promise.resolve();expect(complete).toBe(false);controller.close();await pending;expect(complete).toBe(true);});
 it('rejects 200 error text, interruption and overlimit without exposing content',async()=>{await expect(consumeClickHouseCommand(new Response('Code: 241 secret-address'),'SAFE')).rejects.toThrow(/^SAFE$/);await expect(consumeClickHouseCommand(new Response('     '),'SAFE',4)).rejects.toThrow(/^SAFE$/);const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([32]));c.error(Error('private transport address'));}});await expect(consumeClickHouseCommand(new Response(stream),'SAFE')).rejects.toThrow(/^SAFE$/);});
 it.each(factories)('adapter $name refuses HTTP 200 execution failure',async Factory=>{const config={url:'http://localhost',username:'local',password:'private',fetch:async()=>new Response('Code: 241 secret-address')};const store=new Factory(config);await expect(store.initialize()).rejects.toThrow(/UNAVAILABLE|HTTP_FAILURE/);});
 it.each(factories)('adapter $name accepts bounded whitespace command acknowledgements',async Factory=>{const store=new Factory({url:'http://localhost',username:'local',password:'private',fetch:async()=>new Response(' \r\n\t')});await expect(store.initialize()).resolves.toBeUndefined();});
 it('real local HTTP chunked completion rejects late 200 exception',async()=>{const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/plain'});response.write(' \n');setImmediate(()=>response.end('Code: 241 private-server-message'));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));try{const address=server.address() as AddressInfo;const response=await fetch(`http://127.0.0.1:${address.port}`);await expect(consumeClickHouseCommand(response,'SAFE')).rejects.toThrow(/^SAFE$/);}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}});
});
