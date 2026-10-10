import { describe, expect, it } from 'vitest';
import { EXTERNAL_ERRORS, ExternalError } from '../../src/server/external-errors.js';
describe('external API error contract', () => {
  it('uses bounded public messages and stable statuses without accepting provider payloads', () => {
    for (const [code, definition] of Object.entries(EXTERNAL_ERRORS)) {
      const error = new ExternalError(code as keyof typeof EXTERNAL_ERRORS);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.message).toBe(definition.message);
      expect(error.statusCode).toBe(definition.statusCode);
      expect(error.message).not.toContain('Bearer');
      expect(error.message).not.toContain('https://');
    }
    expect(new ExternalError('ai_budget_exceeded').statusCode).toBe(429);
    expect(new ExternalError('external_provider_failed').statusCode).toBe(502);
    expect(new ExternalError('outbound_destination_blocked').statusCode).toBe(403);
  });
});
