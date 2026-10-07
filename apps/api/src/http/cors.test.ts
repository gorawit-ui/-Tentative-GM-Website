// A01 — CORS: only the app's own origins (Part 6 §6.2: Hosting serves the SPA and rewrites /api/**
// to Cloud Run; domains gm.tdfb.co / gm-dev.tdfb.co are proposals, so they are configurable).
import { describe, expect, it } from 'vitest';
import { corsDecision, defaultAllowedOrigins, resolveAllowedOrigins } from './cors';

describe('allowed origins per environment', () => {
  it('prod: the prod app only; dev: the dev app only; local: the Vite dev/preview servers', () => {
    expect(defaultAllowedOrigins('prod')).toEqual(['https://gm.tdfb.co']);
    expect(defaultAllowedOrigins('dev')).toEqual(['https://gm-dev.tdfb.co']);
    expect(defaultAllowedOrigins('local')).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
  });

  it('an override replaces the defaults once the real domains are confirmed (P7-INFRA-01)', () => {
    expect(resolveAllowedOrigins('prod', 'https://gm.example-confirmed.co')).toEqual(['https://gm.example-confirmed.co']);
    expect(resolveAllowedOrigins('dev', ' https://a.tdfb.co , https://b.tdfb.co ')).toEqual(['https://a.tdfb.co', 'https://b.tdfb.co']);
    expect(resolveAllowedOrigins('prod', undefined)).toEqual(['https://gm.tdfb.co']);
  });

  it.each(['*', 'http://gm.tdfb.co', 'https://gm.tdfb.co/', 'https://gm.tdfb.co/app', 'gm.tdfb.co', 'https://*.tdfb.co', 'null'])(
    'refuses an unsafe override entry %j',
    (entry) => {
      expect(() => resolveAllowedOrigins('prod', entry)).toThrow();
    },
  );

  it('plain http is allowed only for localhost / 127.0.0.1 in the local environment', () => {
    expect(() => resolveAllowedOrigins('local', 'http://localhost:5173')).not.toThrow();
    expect(() => resolveAllowedOrigins('prod', 'http://localhost:5173')).toThrow();
  });
});

describe('corsDecision', () => {
  const allowed = defaultAllowedOrigins('prod');

  it('an allowed origin is echoed back with Vary: Origin and no credentials', () => {
    expect(corsDecision('https://gm.tdfb.co', allowed)).toEqual({
      allowed: true,
      headers: { 'access-control-allow-origin': 'https://gm.tdfb.co', vary: 'Origin' },
    });
  });

  it('no Origin header (server-to-server, same-origin GET) is not a CORS request', () => {
    expect(corsDecision(undefined, allowed)).toEqual({ allowed: true, headers: { vary: 'Origin' } });
  });

  it.each([
    'https://gm.tdfb.co.evil.com',
    'https://evil-gm.tdfb.co',
    'https://gm-dev.tdfb.co',
    'http://gm.tdfb.co',
    'https://GM.TDFB.CO',
    'https://gm.tdfb.co:8443',
    'http://localhost:5173',
    'null',
  ])('refuses %s with no allow-origin header', (origin) => {
    expect(corsDecision(origin, allowed)).toEqual({ allowed: false, headers: { vary: 'Origin' } });
  });
});
