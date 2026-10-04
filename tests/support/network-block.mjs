// @ts-check
/**
 * Refuses every outbound network attempt in the current process: TCP/TLS sockets (which also
 * covers http, https and undici/fetch), fetch itself and DNS. Used by the unit-test setup and
 * by the no-network preload that proves a script never reaches the network.
 */
import dns from 'node:dns';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

const INSTALLED = Symbol.for('gm.tests.networkBlock');
const DNS_FUNCTIONS = /** @type {const} */ ([
  'lookup',
  'lookupService',
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCname',
  'resolveMx',
  'resolveNs',
  'resolveSrv',
  'resolveTxt',
]);

/** @param {unknown[]} args */
function describeConnect(args) {
  const [first, second] = args;
  if (typeof first === 'object' && first !== null) {
    const options = /** @type {{ host?: unknown, port?: unknown, path?: unknown }} */ (first);
    return options.path !== undefined ? `ipc ${String(options.path)}` : `${String(options.host ?? 'localhost')}:${String(options.port)}`;
  }
  return typeof second === 'string' ? `${second}:${String(first)}` : String(first);
}

/**
 * @param {{ onAttempt: (description: string) => void }} options
 *   called with a description of each attempt; the attempt is refused afterwards either way.
 */
export function installNetworkBlock({ onAttempt }) {
  const registry = /** @type {Record<symbol, unknown>} */ (/** @type {unknown} */ (globalThis));
  if (registry[INSTALLED]) return;
  registry[INSTALLED] = true;

  /** @param {string} description @returns {never} */
  const refuse = (description) => {
    onAttempt(description);
    throw new Error(`Network access is blocked in this process (${description}).`);
  };

  /** @type {any} */ (net.Socket.prototype).connect = function connect(/** @type {unknown[]} */ ...args) {
    refuse(`socket connect ${describeConnect(args)}`);
  };
  const dnsModule = /** @type {any} */ (dns);
  const dnsPromises = /** @type {any} */ (dns.promises);
  for (const name of DNS_FUNCTIONS) {
    dnsModule[name] = (/** @type {unknown} */ host) => refuse(`dns ${name} ${String(host)}`);
    dnsPromises[name] = async (/** @type {unknown} */ host) => refuse(`dns ${name} ${String(host)}`);
  }
  globalThis.fetch = async (input) => refuse(`fetch ${input instanceof Request ? input.url : String(input)}`);
  syncBuiltinESMExports();
}
