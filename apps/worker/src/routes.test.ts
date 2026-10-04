import { describe, expect, it } from 'vitest';
import { createRoute } from './routes';

describe('gm-worker routes', () => {
  it('reports the active notification mode in the health check', () => {
    expect(createRoute('local')('GET', '/healthz')).toEqual({
      status: 200,
      body: { status: 'ok', service: 'gm-worker', notificationMode: 'local' },
    });
  });

  it('rejects other methods on the health check', () => {
    expect(createRoute('disabled')('POST', '/healthz').status).toBe(405);
  });

  it('has no tick or task endpoint yet', () => {
    expect(createRoute('local')('POST', '/internal/tick')).toEqual({ status: 404, body: { error: 'not_found' } });
  });
});
