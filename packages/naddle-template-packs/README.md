# @naddle/template-packs

Local tenant template packs for NaddleOffice.

> **Main/Node only.** This package reads and writes files and must not be
> imported by renderer code.

A tenant pack is a folder or zip with a `naddle-template-manifest` v1
`manifest.json`, one or more form skills, and their form files. Packs are
validated in full before anything is installed: safe unpack, file allowlist,
manifest rules, licenses, sha256, scripts and macros.

Packs are stored per tenant under
`<userData>/tenants/<tenantKey>/template-packs/<packId>/` with a small
`index.json`. The personal skill folder (`~/.ieumoffice/skills`) is never
written. There is no server, remote catalog or cross-machine sync.

## Validation order

1. Safe unpack (the `@genoffice/ai-provider` archive helpers).
2. File allowlist, including stray `assets/` and `SKILL.md` files.
3. Manifest parse; `scope` must be `tenant`, `pack.id` is required, every
   source must be `{ "type": "tenant", "pack": <pack.id> }`.
4. License policy (`proprietary-tenant`, `Apache-2.0`, `MIT`, `CC0-1.0`,
   `CC-BY-4.0`, `KOGL-Type1` only) and vendor/marketplace origin rejection.
5. sha256 of each form file, re-checked when an installed pack is read.
6. Scripts and MCP declarations are a hard failure.
7. Macro-enabled Office files, HWPX scripts, external relationships and
   extension/content mismatches are a hard failure.
8. The user must attest the right to use the forms.
9. Install into a staging folder, then rename into place and update the index.

## Signed packs (Ed25519)

A pack may carry a detached signature at its root as `manifest.sig.json`.
The signature covers the pack id and version, the signing time and every
regular file under the pack root except the sidecar itself. The app recomputes
the file list from disk before it verifies, so a changed, added or removed file
fails closed. Unsigned packs still install under the default policy and are
shown as unsigned.

The built-in official key list is empty in this version. Custom keys are
registered per tenant in Settings → Company forms → Signing keys. A tenant key
is trusted only in that tenant's store.

### Generate a key

```sh
npm run keygen -w @naddle/template-packs -- --out-dir /secure/path
```

This writes `ed25519-<hex>.pub.pem` (public) and `ed25519-<hex>.key.pem` (private,
mode 0600). The key id's `:` is replaced with `-` so Windows can hold the name. It refuses an output folder inside a git work tree. Keep the private key
outside the repository, the pack and any log.

Recommended permissions:

- POSIX: `0600`, owned by the pack author only. The CLI warns when group or
  other bits are readable and `--strict-perms` refuses them.
- Windows: keep the key under your user profile, never in a shared folder.
  Windows ACLs are not enforced by this code; check them yourself.

### Sign a pack

```sh
NADDLE_PACK_SIGNING_KEY=/secure/path/<keyId>.key.pem \
  npm run sign -w @naddle/template-packs -- /path/to/pack
```

`--key-file /path/to/key.pem` works as well. Key material is accepted only as a
file path, never as an argument or environment value. The command runs the full
validator first and refuses a pack with problems, a signature failure or any
`*.pem`/`*.key` file. It writes the sidecar, verifies it again with the public
key and prints only the key id, file count and sidecar path.

### Verify a pack

```sh
npm run verify -w @naddle/template-packs -- /path/to/pack --pub /secure/path/<keyId>.pub.pem
```

Exit code 0 means the signature is valid; anything else is a failure. The
command prints only the status and key id.

### Rotation and revocation

Register a new public key before signing with it, then sign new packs with the
new key. A key may carry `notAfter`; packs signed after that time are rejected,
while packs signed earlier stay valid until the key is revoked. Revoke a key in
Settings (local, for this tenant) or in the app build's built-in revocation
list. Revocation is fail-closed and does not depend on the pack's signed time.

There is no key server, no network call in signing or verification, and no
automatic update or catalog.

## Commands

```sh
npm run test -w @naddle/template-packs
npm run typecheck -w @naddle/template-packs
npm run sign -w @naddle/template-packs -- <pack-folder>
npm run verify -w @naddle/template-packs -- <pack-folder> --pub <public.pem>
npm run keygen -w @naddle/template-packs -- --out-dir <folder>
```
