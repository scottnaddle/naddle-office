/**
 * Keys shipped inside the app as trust roots for official Naddle packs.
 *
 * S4c ships no official key. The list stays empty until a separate decision
 * names the key, its owner and where the private half is kept. Tenant keys are
 * registered in Settings instead.
 */
import { keyIdOfPublicKeyPem, type TrustedPackKey } from '../signature'

const DECLARED: readonly TrustedPackKey[] = []

/** The declared keys whose PEM still hashes to the id written beside it. */
export const BUILTIN_PACK_KEYS: readonly TrustedPackKey[] = DECLARED.filter((key) => {
  try {
    return keyIdOfPublicKeyPem(key.publicKeyPem) === key.keyId
  } catch {
    return false
  }
})
