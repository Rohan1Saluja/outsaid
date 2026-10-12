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

async function authRequest(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/auth/${path}`, { ...init, credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', ...init?.headers } });
  } catch { throw new ApiError(503, 'UNAVAILABLE', 'The service could not be reached.'); }
  if (response.status === 204) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, isApiError(body) ? body.error.code : 'HTTP_ERROR',
    isApiError(body) ? body.error.message : 'The service could not be reached.');
  return body;
}
function parseUser(value: unknown): import('@outsaid/contracts').CurrentUser {
  if (value && typeof value === 'object' && 'user' in value) {
    const user = value.user;
    if (user && typeof user === 'object' && 'id' in user && typeof user.id === 'string'
      && 'displayName' in user && typeof user.displayName === 'string' && 'role' in user
      && (user.role === 'CONTRIBUTOR' || user.role === 'MODERATOR' || user.role === 'ADMIN')) {
      return { id: user.id, displayName: user.displayName, role: user.role };
    }
  }
  throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid service response.');
}
export const getMe = async () => parseUser(await authRequest('me'));
export const login = async (input: import('@outsaid/contracts').LoginRequest) => parseUser(await authRequest('login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
}));
export async function logout(): Promise<void> {
  const value = await authRequest('csrf');
  if (!value || typeof value !== 'object' || !('csrfToken' in value) || typeof value.csrfToken !== 'string') {
    throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid service response.');
  }
  await authRequest('logout', { method: 'POST', headers: { 'x-csrf-token': value.csrfToken } });
}
