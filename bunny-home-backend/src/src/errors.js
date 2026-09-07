export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function notFound(message = 'not_found') {
  return new HttpError(404, 'not_found', message);
}

export function badRequest(code, message) {
  return new HttpError(400, code, message);
}
