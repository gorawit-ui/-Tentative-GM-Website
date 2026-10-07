// Emulator-only guarantee (CLAUDE.md, S12): every Rules/emulator test runs with outbound network
// limited to the local emulators. A request to any other host — Google APIs, a token endpoint, a
// real bucket — throws instead of leaving the machine.
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const blockedHosts: string[] = [];

function hostOf(target: unknown): string | undefined {
  if (typeof target === 'string') {
    try {
      return new URL(target).hostname;
    } catch {
      return undefined;
    }
  }
  if (target instanceof URL) return target.hostname;
  if (target !== null && typeof target === 'object') {
    const options = target as { hostname?: unknown; host?: unknown };
    const host = options.hostname ?? options.host;
    return typeof host === 'string' ? host.replace(/:\d+$/, '') : 'localhost';
  }
  return undefined;
}

function guard(host: string | undefined): void {
  if (host !== undefined && !LOCAL.has(host)) {
    blockedHosts.push(host);
    throw new Error(`network-guard: outbound request to ${host} blocked (emulators only)`);
  }
}

for (const module of [http, https] as const) {
  const request = module.request as (...args: unknown[]) => http.ClientRequest;
  const get = module.get as (...args: unknown[]) => http.ClientRequest;
  (module as { request: unknown }).request = (...args: unknown[]) => {
    guard(hostOf(args[0]));
    return request.apply(module, args);
  };
  (module as { get: unknown }).get = (...args: unknown[]) => {
    guard(hostOf(args[0]));
    return get.apply(module, args);
  };
}
syncBuiltinESMExports();

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  guard(hostOf(input instanceof Request ? input.url : input));
  return realFetch(input, init);
}) as typeof fetch;
