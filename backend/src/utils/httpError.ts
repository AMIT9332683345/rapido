export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'REQUEST_FAILED', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have access to this action') {
    return new HttpError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Not found') {
    return new HttpError(404, message, 'NOT_FOUND');
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new HttpError(409, message, code);
  }
  static tooMany(message = 'Too many requests') {
    return new HttpError(429, message, 'RATE_LIMITED');
  }
  static unavailable(message = 'Service temporarily unavailable', details?: unknown) {
    return new HttpError(503, message, 'SERVICE_UNAVAILABLE', details);
  }
}
