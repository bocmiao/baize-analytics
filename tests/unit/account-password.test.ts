import {describe,it,expect} from 'vitest';
import {accountPasswordSchema} from '../../src/shared/account-password.js';
describe('account password compatibility boundary',()=>{it('preserves 12 through 1024 JS characters and rejects surrounding lengths',()=>{for(const length of [12,256,257,1024])expect(accountPasswordSchema.parse('a'.repeat(length))).toHaveLength(length);for(const length of [11,1025])expect(accountPasswordSchema.safeParse('a'.repeat(length)).success).toBe(false);expect(accountPasswordSchema.parse('界'.repeat(1024))).toHaveLength(1024);});});
