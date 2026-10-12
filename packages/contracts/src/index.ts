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

export type ClaimBasis = 'ALLEGATION' | 'EYEWITNESS_ACCOUNT' | 'DOCUMENTED_INFORMATION';
export interface SourceReference {
  kind: 'DOCUMENT' | 'LINK' | 'EYEWITNESS';
  label: string;
  url?: string | null;
  notes?: string | null;
}
export interface ReportContent {
  headline: string;
  body: string;
  locality?: string | null;
  claimBasis: ClaimBasis;
  sources: SourceReference[];
}
/** PATCH replaces all content and sources, preserving immutable earlier revisions. */
export interface EditReportRequest extends ReportContent { expectedVersion: number; changeSummary: string }
export interface SubmitReportRequest { expectedVersion: number }
export interface PrivateReportSummary {
  id: string;
  headline: string;
  claimBasis: ClaimBasis;
  publicationStatus: 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'PUBLISHED' | 'WITHDRAWN';
  verificationStatus: 'UNVERIFIED' | 'PARTIALLY_CORROBORATED' | 'CORROBORATED' | 'DISPUTED';
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}
export interface PrivateReport extends PrivateReportSummary, ReportContent {}
