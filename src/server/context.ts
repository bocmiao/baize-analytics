import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
export type Permission = 'read' | 'write' | 'admin';
export interface User { id: string; email: string; name: string; is_admin: boolean }
export interface AppContext {
  pool: Pool;
  redis: Redis | null;
  config: { dataDir: string; masterKey: Buffer; publicUrl: string; allowLocalTest?: boolean };
  user(request: FastifyRequest): Promise<User>;
  authorize(request: FastifyRequest, siteId: string, permission?: Permission): Promise<User>;
  audit(actorId: string | null, siteId: string | null, action: string, target: unknown): Promise<void>;
}
