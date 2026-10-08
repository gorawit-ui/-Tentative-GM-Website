// A02 stub — implemented after the failing tests are committed.
export interface WorkerLogFields {
  readonly step?: string;
  readonly kind?: string;
  readonly state?: string;
  readonly channel?: string;
  readonly code?: string;
  readonly outbox_id?: string;
  readonly job_id?: string;
  readonly request_id?: string;
  readonly count?: number;
  readonly attempts?: number;
}

export interface WorkerLogger {
  info(event: string, fields?: WorkerLogFields): void;
  warn(event: string, fields?: WorkerLogFields): void;
}

export const consoleWorkerLogger: WorkerLogger = {
  info: () => undefined,
  warn: () => undefined,
};
