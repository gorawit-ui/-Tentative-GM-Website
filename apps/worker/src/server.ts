import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export interface ServerOptions {
  readonly name: string;
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  readonly defaultPort: number;
}

// Minimal HTTP server for the worker entrypoint (gm-api has its own in apps/api/src/main.ts).
export function startServer({ name, handler, defaultPort }: ServerOptions): Server {
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name}: PORT must be an integer between 0 and 65535`);
  }
  const host = process.env.HOST ?? '127.0.0.1';
  const server = createServer(handler);

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
