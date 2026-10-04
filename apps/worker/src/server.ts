import { createServer, type Server } from 'node:http';
import type { JsonResponse } from './routes';

export interface ServerOptions {
  readonly name: string;
  readonly route: (method: string, path: string) => JsonResponse;
  readonly defaultPort: number;
}

// Same minimal JSON server as gm-api (one image, different entrypoint). Extract a shared
// server module once A01/A02 add real shared runtime code.
export function startServer({ name, route, defaultPort }: ServerOptions): Server {
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name}: PORT must be an integer between 0 and 65535`);
  }
  const host = process.env.HOST ?? '127.0.0.1';

  const server = createServer((request, response) => {
    const method = request.method ?? 'GET';
    const result = route(method, new URL(request.url ?? '/', 'http://localhost').pathname);
    response.writeHead(result.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...result.headers,
    });
    response.end(method === 'HEAD' ? undefined : JSON.stringify(result.body));
  });

  server.listen(port, host, () => {
    console.info(`${name} listening on http://${host}:${port} (project: ${process.env.GCLOUD_PROJECT ?? 'none'})`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.info(`${name} received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
