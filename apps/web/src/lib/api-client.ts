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
    && 'message' in error && typeof error.message === 'string'
    && (!('details' in error) || (Array.isArray(error.details) && error.details.every((item: unknown) => typeof item === 'string')));
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

async function reportRequest(path: string, method = 'GET', input?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    const csrf = await authRequest('csrf');
    if (!csrf || typeof csrf !== 'object' || !('csrfToken' in csrf) || typeof csrf.csrfToken !== 'string') {
      throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid service response.');
    }
    headers['x-csrf-token'] = csrf.csrfToken;
    headers['Content-Type'] = 'application/json';
  }
  let response: Response;
  try { response = await fetch(`/api/v1/reports${path}`, { method, headers, credentials: 'same-origin', cache: 'no-store',
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); }
  catch { throw new ApiError(503, 'UNAVAILABLE', 'The service could not be reached.'); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, isApiError(body) ? body.error.code : 'HTTP_ERROR',
    isApiError(body) ? [body.error.message, ...(body.error.details ?? [])].join(' ') : 'The service could not be reached.');
  return body;
}
function parseSummary(value: unknown): import('@outsaid/contracts').PrivateReportSummary {
  if (!value || typeof value !== 'object') throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid report response.');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.headline !== 'string' || !['ALLEGATION', 'EYEWITNESS_ACCOUNT', 'DOCUMENTED_INFORMATION'].includes(String(row.claimBasis))
    || !['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'PUBLISHED', 'WITHDRAWN'].includes(String(row.publicationStatus))
    || !['UNVERIFIED', 'PARTIALLY_CORROBORATED', 'CORROBORATED', 'DISPUTED'].includes(String(row.verificationStatus))
    || typeof row.version !== 'number' || !Number.isInteger(row.version) || row.version < 1
    || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string' || !(row.submittedAt === null || typeof row.submittedAt === 'string')) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid report response.');
  }
  return { id: row.id, headline: row.headline, claimBasis: row.claimBasis as import('@outsaid/contracts').ClaimBasis,
    publicationStatus: row.publicationStatus as import('@outsaid/contracts').PrivateReportSummary['publicationStatus'],
    verificationStatus: row.verificationStatus as import('@outsaid/contracts').PrivateReportSummary['verificationStatus'],
    version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, submittedAt: row.submittedAt };
}
function parseReport(value: unknown): import('@outsaid/contracts').PrivateReport {
  const base = parseSummary(value);
  const row = value as Record<string, unknown>;
  if (typeof row.body !== 'string' || !(row.locality === null || typeof row.locality === 'string') || !Array.isArray(row.sources)) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid report response.');
  }
  const sources = row.sources.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid source response.');
    const source = value as Record<string, unknown>;
    if (!['DOCUMENT', 'LINK', 'EYEWITNESS'].includes(String(source.kind)) || typeof source.label !== 'string'
      || !(source.url === null || typeof source.url === 'string') || !(source.notes === null || typeof source.notes === 'string')) {
      throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid source response.');
    }
    return { kind: source.kind as import('@outsaid/contracts').SourceReference['kind'], label: source.label, url: source.url, notes: source.notes };
  });
  return { ...base, body: row.body, locality: row.locality, sources };
}
export async function getMyReports(cursor?: string) {
  const value = await reportRequest(`/mine${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
    || !('nextCursor' in value) || !(value.nextCursor === null || typeof value.nextCursor === 'string')) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid report list response.');
  }
  return { items: value.items.map(parseSummary), nextCursor: value.nextCursor };
}
export const getReport = async (id: string) => parseReport(await reportRequest(`/${encodeURIComponent(id)}`));
export const createReport = async (input: import('@outsaid/contracts').ReportContent) => parseReport(await reportRequest('', 'POST', input));
export const editReport = async (id: string, input: import('@outsaid/contracts').EditReportRequest) => parseReport(await reportRequest(`/${encodeURIComponent(id)}`, 'PATCH', input));
export const submitReport = async (id: string, expectedVersion: number) => parseReport(await reportRequest(`/${encodeURIComponent(id)}/submit`, 'POST', { expectedVersion }));
export function reportError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'This report changed or became read-only. Your unsaved text is still here. Reload the saved report before continuing.';
    if (error.status === 429) return 'The hourly limit was reached. Keep this page open to preserve your unsaved text and try again after the current hour.';
    if (error.status === 404) return 'This report is unavailable.';
    if (error.status === 400) return error.message;
    if (error.status === 403) return 'Request protection failed. Try again to refresh your session protection.';
  }
  return 'The service is unavailable. Your unsaved text is still here. Please try again.';
}
