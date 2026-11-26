/**
 * One error shape for the whole app. Every service rejects/returns AppError so
 * the central handler can map `code` to UI without parsing messages.
 * `message` is for developers; never put document content, filenames or
 * passwords in it (logs must not leak sensitive data).
 */
export type AppErrorCode =
  | 'INVALID_PDF'
  | 'CORRUPTED_PDF'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_INCORRECT'
  | 'UNSUPPORTED_ENCRYPTION'
  | 'INVALID_PAGE_RANGE'
  | 'INVALID_ANNOTATION_DATA'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'STORAGE_FAILURE'
  | 'DRAFT_CONFLICT'
  | 'SIGNATURE_LIMIT_REACHED'
  | 'REDACTION_UNSAFE'
  | 'UNSUPPORTED_BROWSER_API'
  | 'CANCELLED'
  | 'INTERNAL'

export interface AppError {
  readonly code: AppErrorCode
  readonly message: string
  /** Structured context safe to log (counts, indexes, versions) — no user content. */
  readonly details?: Readonly<Record<string, string | number | boolean>>
}

/** Expected failures are returned, not thrown; only programmer errors throw. */
export type Result<T, E extends AppError = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E extends AppError>(error: E): Result<never, E> => ({ ok: false, error })
