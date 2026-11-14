/**
 * Keys revoked with an app release. Local revocation lives in the tenant's
 * `revoked-keys.json`; both lists are checked before a signature is accepted.
 */
import type { RevokedPackKey } from '../signature'

/** The keys revoked by this app build. Empty until an official key exists. */
export const REVOKED_PACK_KEYS: readonly RevokedPackKey[] = []
