export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(code: 'missing_init_data' | 'malformed' | 'invalid_signature' | 'expired', message?: string) {
    super(401, code, message ?? 'Telegram authorization failed');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
    this.name = 'NotFoundError';
  }
}
