// ApiErrors.ts
export enum ApiErrorType {
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

export class ApiError extends Error {
  type: ApiErrorType;
  statusCode: number;

  constructor(message: string, type: ApiErrorType, statusCode: number) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}