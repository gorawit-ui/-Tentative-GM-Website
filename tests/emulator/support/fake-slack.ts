// A07 — a Slack Web API stand-in on 127.0.0.1 (never the real Slack): records each call and answers
// as told — OK, 429 with Retry-After, an `ok: false` error, an HTTP status, or no answer at all (a
// request that reached Slack whose answer never came back).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeSlackAnswer =
  | { readonly kind: 'ok' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'hang' };

export interface FakeSlackCall {
  readonly path: string;
  readonly authorization: string | undefined;
  readonly contentType: string | undefined;
  readonly body: Record<string, unknown>;
}

export interface FakeSlack {
  /** `http://127.0.0.1:<port>/api` — what the adapter is configured with instead of https://slack.com/api. */
  readonly apiBaseUrl: string;
  readonly calls: FakeSlackCall[];
  /** Answers for the next calls, in order; after them every call is answered OK. */
  answer(...answers: FakeSlackAnswer[]): void;
  reset(): void;
  close(): Promise<void>;
}

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function startFakeSlack(): Promise<FakeSlack> {
  const calls: FakeSlackCall[] = [];
  let queue: FakeSlackAnswer[] = [];
  const hanging: ServerResponse[] = [];
  let sequence = 0;
  const server: Server = createServer((request, response) => {
    void (async () => {
      const body = await bodyOf(request);
      calls.push({ path: request.url ?? '', authorization: request.headers.authorization, contentType: request.headers['content-type'], body });
      const answer = queue.shift() ?? { kind: 'ok' };
      switch (answer.kind) {
        case 'ok':
          sequence += 1;
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, channel: 'D0FAKE0001', ts: `1736.${String(sequence).padStart(6, '0')}` }));
          return;
        case 'rate_limited':
          response.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(answer.retryAfterSeconds) });
          response.end(JSON.stringify({ ok: false, error: 'ratelimited' }));
          return;
        case 'error':
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: answer.error }));
          return;
        case 'http':
          response.writeHead(answer.status, { 'content-type': 'text/plain' });
          response.end('upstream trouble');
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
    apiBaseUrl: `http://127.0.0.1:${port}/api`,
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
