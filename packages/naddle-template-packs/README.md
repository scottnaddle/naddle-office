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

## Commands

```sh
npm run test -w @naddle/template-packs
npm run typecheck -w @naddle/template-packs
```
