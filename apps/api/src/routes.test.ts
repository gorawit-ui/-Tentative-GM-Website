import { describe, expect, it } from 'vitest';
import { route } from './routes';

describe('gm-api routes', () => {
  it('answers the health check with the shared contract', () => {
    expect(route('GET', '/healthz')).toEqual({ status: 200, body: { status: 'ok', service: 'gm-api' } });
    expect(route('HEAD', '/healthz').status).toBe(200);
  });

  it('rejects other methods on the health check', () => {
    expect(route('POST', '/healthz')).toEqual({
      status: 405,
      body: { error: 'method_not_allowed' },
      headers: { allow: 'GET, HEAD' },
    });
  });

  it('returns 404 for anything else (no endpoints exist before A01)', () => {
    expect(route('GET', '/api/requests')).toEqual({ status: 404, body: { error: 'not_found' } });
  });
});
