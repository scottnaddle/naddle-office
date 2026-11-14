/** Errors the tenant pack engine raises. Messages are safe to show to the user. */

export type TenantPackErrorCode =
  | 'invalid-tenant'
  | 'bad-address'
  | 'single-skill'
  | 'invalid-pack'
  | 'attestation-required'
  | 'unsafe'
  | 'too-large'
  | 'not-found'
  | 'failed'
  | 'bad-signature'
  | 'unknown-key'
  | 'revoked-key'
  | 'expired-key'
  | 'trust-store-unreadable'
  | 'bad-key'

export class TenantPackError extends Error {
  readonly code: TenantPackErrorCode

  constructor(code: TenantPackErrorCode, message: string) {
    super(message)
    this.name = 'TenantPackError'
    this.code = code
  }
}

export function tenantPackMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
