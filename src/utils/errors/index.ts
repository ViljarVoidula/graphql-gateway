export interface ApplicationError {
  name: string;
  message: string;
  className: string;
  data?: any;
  errors?: any;
}
export type ErrorMessage = string | { [key: string]: any } | any[];
export class BaseError extends Error {
  readonly type: string;
  readonly code: number;
  readonly className: string;
  readonly data: any;
  readonly errors: any;

  constructor(
    err: ErrorMessage,
    name: string,
    code: number,
    className: string,
    _data: any
  ) {
    let message = typeof err === 'string' ? err : 'Error';
    let properties = {
      name,
      code,
      className,
      type: 'ApplicationError',
      data: undefined as any,
      errors: undefined as any[],
    };

    if (Array.isArray(_data)) {
      properties.data = _data;
    } else if (typeof err === 'object' || _data !== undefined) {
      const { message, errors, ...rest } =
        typeof err === 'object' ? err : _data;

      properties.errors = errors;
      properties.data = rest;
    }

    super(message);
    Object.assign(this, properties);
  }

  toJSON() {
    const result: ErrorMessage = {
      name: this.name,
      message: this.message,
      code: this.code,
      className: this.className,
    };

    if (this.data !== undefined) {
      result.data = this.data;
    }

    if (this.errors !== undefined) {
      result.errors = this.errors;
    }

    return result;
  }
}

export class InputValidationError extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'BadRequest', 422, 'input-validation', data);
  }
}
export class BadRequest extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'BadRequest', 400, 'bad-request', data);
  }
}
export class NotAuthenticated extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'NotAuthenticated', 401, 'not-authenticated', data);
  }
}

export class Forbidden extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'Forbidden', 403, 'forbidden', data);
  }
}

export class NotFound extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'NotFound', 404, 'not-found', data);
  }
}

export class GeneralError extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'GeneralError', 500, 'general-error', data);
  }
}

export class Unavailable extends BaseError {
  constructor(message?: ErrorMessage, data?: any) {
    super(message, 'Unavailable', 503, 'unavailable', data);
  }
}
