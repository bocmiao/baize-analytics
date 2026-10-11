import {it,expect,vi} from 'vitest';
import {disconnectTestRedis} from '../fixtures/disconnect-redis.js';

it('releases an explicitly disconnected client even while its status remains ready, without QUIT',()=>{
 const quit=vi.fn(()=>{throw Error("Stream isn't writeable and enableOfflineQueue options is false");});
 const client={status:'ready',disconnect:vi.fn(),quit};
 client.disconnect(); // The fault leaves stale status until the close event.
 expect(client.status).toBe('ready');
 expect(()=>disconnectTestRedis(client)).not.toThrow();
 expect(()=>disconnectTestRedis(client)).not.toThrow();
 expect(client.disconnect).toHaveBeenCalledTimes(3);
 expect(quit).not.toHaveBeenCalled();
});

it('does not inspect a changing connection status and tolerates absent setup clients',()=>{
 const client={get status():string{throw Error('status raced with stream close');},disconnect:vi.fn()};
 expect(()=>disconnectTestRedis(client)).not.toThrow();
 expect(()=>disconnectTestRedis(undefined)).not.toThrow();
 expect(client.disconnect).toHaveBeenCalledOnce();
});
