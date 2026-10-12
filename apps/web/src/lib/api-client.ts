import type { ApiErrorResponse, HealthResponse } from '@outsaid/contracts';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
function isApiError(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = value.error;
  return !!error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    && 'message' in error && typeof error.message === 'string';
}
/** Browser-only same-origin client. SSR callers need an explicit trusted proxy origin. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, isApiError(body) ? body.error.code : 'HTTP_ERROR',
      isApiError(body) ? body.error.message : 'The service could not be reached.');
  }
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok'
    || !('service' in body) || body.service !== 'outsaid-api') {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The service returned an invalid response.');
  }
  return { status: body.status, service: body.service };
}
