// S12 — what an endpoint answers when it refuses. Codes only: no names, e-mails or request text.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** A request the caller may not read answers like a missing one, so its existence does not leak. */
export const notFound = () => new ApiError(404, 'NOT_FOUND');
