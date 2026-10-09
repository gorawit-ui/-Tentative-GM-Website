// A08 — a Gmail API `users.messages.send` stand-in on 127.0.0.1 (never the real Gmail): records each
// call with the raw message decoded (headers unfolded, RFC 2047 words and the base64 body decoded —
// independently of the encoder under test) and answers as told — OK, 429 with Retry-After, 403 quota
// (`dailyLimitExceeded`), 400 invalid recipient, an HTTP status, or no answer at all.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeGmailAnswer =
  | { readonly kind: 'ok' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds?: number }
  | { readonly kind: 'quota'; readonly reason?: string }
  | { readonly kind: 'invalid_recipient' }
  | { readonly kind: 'http'; readonly status: number; readonly reason?: string }
  | { readonly kind: 'hang' };

export interface SentMail {
  readonly path: string;
  readonly authorization: string | undefined;
  /** The raw RFC 5322 text as sent (CRLF). */
  readonly raw: string;
  /** Unfolded header values by lowercase name, encoded words decoded. */
  readonly headers: Readonly<Record<string, string>>;
  /** Header lines exactly as sent (before unfolding). */
  readonly headerLines: readonly string[];
  readonly body: string;
}

export interface FakeGmail {
  /** `http://127.0.0.1:<port>` — instead of https://gmail.googleapis.com. */
  readonly apiBaseUrl: string;
  readonly calls: SentMail[];
  answer(...answers: FakeGmailAnswer[]): void;
  reset(): void;
  close(): Promise<void>;
}

function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(?:\s+(?==\?))?/g, (_whole, _charset: string, encoding: string, text: string) =>
    encoding.toUpperCase() === 'B' ? Buffer.from(text, 'base64').toString('utf8') : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'),
  );
}

function decodeMail(path: string, authorization: string | undefined, rawBase64Url: string): SentMail {
  const raw = Buffer.from(rawBase64Url, 'base64url').toString('utf8');
  const split = raw.indexOf('\r\n\r\n');
  const headerLines = split < 0 ? [] : raw.slice(0, split).split('\r\n');
  const headers: Record<string, string> = {};
  let last = '';
  for (const line of headerLines) {
    if (/^[ \t]/.test(line)) {
      headers[last] = `${headers[last] ?? ''}${line}`;
      continue;
    }
    const colon = line.indexOf(':');
    last = line.slice(0, colon).toLowerCase();
    headers[last] = line.slice(colon + 1).trim();
  }
  for (const key of Object.keys(headers)) headers[key] = decodeWords(headers[key] ?? '');
  const content = split < 0 ? '' : raw.slice(split + 4);
  const decoded = headers['content-transfer-encoding']?.toLowerCase() === 'base64' ? Buffer.from(content.replace(/\r\n/g, ''), 'base64').toString('utf8') : content;
  // Text travels in canonical form (CRLF, RFC 2045); compared in tests with \n.
  const body = decoded.replace(/\r\n/g, '\n');
  return { path, authorization, raw, headers, headerLines, body };
}

async function jsonOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const googleError = (code: number, message: string, reason: string) => JSON.stringify({ error: { code, message, errors: [{ message, domain: 'global', reason }], status: code === 429 ? 'RESOURCE_EXHAUSTED' : 'FAILED' } });

export async function startFakeGmail(): Promise<FakeGmail> {
  const calls: SentMail[] = [];
  let queue: FakeGmailAnswer[] = [];
  const hanging: ServerResponse[] = [];
  let sequence = 0;
  const server: Server = createServer((request, response) => {
    void (async () => {
      const body = await jsonOf(request);
      calls.push(decodeMail(request.url ?? '', request.headers.authorization, typeof body.raw === 'string' ? body.raw : ''));
      const answer = queue.shift() ?? { kind: 'ok' };
      const json = { 'content-type': 'application/json; charset=UTF-8' };
      switch (answer.kind) {
        case 'ok':
          sequence += 1;
          response.writeHead(200, json);
          response.end(JSON.stringify({ id: `18c0fake${String(sequence).padStart(4, '0')}`, threadId: `18c0thread${sequence}`, labelIds: ['SENT'] }));
          return;
        case 'rate_limited':
          response.writeHead(429, { ...json, ...(answer.retryAfterSeconds === undefined ? {} : { 'retry-after': String(answer.retryAfterSeconds) }) });
          response.end(googleError(429, 'Too many concurrent requests for user', 'rateLimitExceeded'));
          return;
        case 'quota':
          response.writeHead(403, json);
          response.end(googleError(403, 'Daily user sending quota exceeded', answer.reason ?? 'dailyLimitExceeded'));
          return;
        case 'invalid_recipient':
          response.writeHead(400, json);
          response.end(googleError(400, 'Invalid To header', 'invalidArgument'));
          return;
        case 'http':
          response.writeHead(answer.status, json);
          response.end(googleError(answer.status, 'upstream trouble', answer.reason ?? 'backendError'));
          return;
        case 'hang':
          hanging.push(response);
          return;
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    apiBaseUrl: `http://127.0.0.1:${port}`,
    calls,
    answer: (...answers) => {
      queue.push(...answers);
    },
    reset: () => {
      calls.length = 0;
      queue = [];
      sequence = 0;
    },
    close: async () => {
      for (const response of hanging) response.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
