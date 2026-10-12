/** Wire types only. Never import ORM models or server code here. */
export interface HealthResponse {
  status: 'ok';
  service: 'outsaid-api';
}
export interface ApiErrorResponse {
  error: { code: string; message: string; details?: string[] };
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface CurrentUser {
  id: string;
  displayName: string;
  role: 'CONTRIBUTOR' | 'MODERATOR' | 'ADMIN';
}
export interface AuthResponse { user: CurrentUser }
export interface CsrfResponse { csrfToken: string }
export interface LoginRequest { email: string; password: string }
