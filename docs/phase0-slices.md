# Phase 0 slices — runtime foundation

> Status: draft for review. Documentation only; no code or configuration changes.
> Parent plan: [`docs/plan.md`](plan.md) §6 Phase 0.
> Durations are **estimates** and are relative, not commitments.

## 1. Purpose

Phase 0 removes the two structural blockers before any enterprise feature work:

1. Policy and branding are build-time constants; they must become runtime tenant configuration.
2. Authentication and integration points are tied to one vendor; they must sit behind stable interfaces with adapters.

The phase also fixes the overlay/hook budget and defines how releases/updates are governed. Phase 0 is complete only when all slices pass their acceptance checks on a clean checkout.

## 2. Working rules

- One slice = one reviewable PR. Do not combine slices unless a dependency requires it.
- No authentication/guard weakening. Existing behavior stays the default until an adapter is selected.
- No secrets in the repository. Tenant configuration contains references, never secret values.
- Keep upstream files unchanged unless a hook is explicitly listed in the overlay ledger.
- Every slice must state its rollback path before implementation.
- Release/update design is owned by the devops document; this plan links to it instead of duplicating it.

## 3. Dependency order

```text
P0-1 Runtime tenant config
  ├─ P0-2 Integration/auth boundaries
  ├─ P0-4 Server tenant boundary & audit skeleton
  └─ P0-6 Phase 0 integration gate
P0-3 Overlay & hook budget ────────────────┘
P0-5 Release pipeline design (devops) ─────┘
```

- P0-1 is first; it defines the configuration contract the other slices consume.
- P0-3 and P0-5 can run in parallel with P0-1.
- P0-2 and P0-4 require P0-1's schema.
- P0-6 runs after P0-1 through P0-5.

---

## P0-1 — Runtime tenant configuration

**Goal:** Replace build-time product and configuration constants with a validated runtime tenant configuration.

**Scope**

- Define a `TenantConfig` schema covering: product/brand, policy, authentication provider selection, knowledge source, model gateway, template catalog, retention/feature flags.
- Loader precedence: explicit environment/file override → tenant config file → safe development default.
- Replace the build-time constants the tenant config owns with loader-backed runtime values; the only such constant in this repository today is the product/brand identity in `packages/i18n/src/product.ts`. The five static JSON imports in `docs/plan.md` §3.4 are a ubion-office overlay premise — this repository has no static JSON imports.
- Keep the existing configuration as an example/default profile; do not require an enterprise tenant to build.
- Secret values are referenced by name/path only; no secret values in config or logs.
- Deliver the result as the standalone `packages/tenant-config` core library. No application code imports it yet.
- Wiring the loaded display name into `packages/i18n/src/product.ts` and delivering the resolved config to the renderer over IPC belong to P0-2.

**Deliverables**

- Versioned schema and validation (unknown keys rejected or explicitly ignored).
- Loader with deterministic precedence and clear error messages.
- Default/example tenant profile.
- `packages/tenant-config` as a standalone core library, with no application import yet.
- Tests for precedence, invalid/missing config, secret redaction, and startup with no tenant file.
- Documentation for operators: where the file lives, permissions, override variables, rollback.

**Verification**

- No build-time constant remains for a value the tenant config owns. (The `docs/plan.md` §3.4 JSON import count does not apply to this repository.)
- The loader resolves a changed tenant config at runtime, without rebuilding. (A branding change in the running app is a P0-2 outcome, once the library is wired in.)
- Invalid config fails closed with a readable error; no secret appears in logs.
- Existing default app build still starts and its tests pass.
- `git diff --check`, typecheck, and the project's test suite pass.

**Prerequisite:** none. **Estimate:** 3–5 days.

---

## P0-2 — Tenant config wiring and integration boundaries

**Direction (2026-11-11, replaces the earlier SSO-first wording):** the first real `IdentityProvider` implementation is **Google login** (desktop app: system browser + PKCE + loopback). Enterprise SSO (OIDC/SAML/LDAP), SCIM and directory sync are the **last stage**; OTP and Ubion/Daou messenger premises are **out of scope** for this product.

**Goal:** Connect the tenant config to the app and make the integration seams provider-neutral. Default adapters keep today's behavior, and no authentication or guard is weakened.

**Scope**

- Load the main-owned tenant config once at startup, fail closed on invalid config, and deliver a **redacted snapshot** to the renderer over IPC (no secret references or values).
- Select the runtime display name from the tenant config in `packages/i18n/src/product.ts`; the installed app/file names stay build-time.
- Define interfaces and error taxonomy for:
  - `IdentityProvider` — first adapter: Google OAuth 2.0 (Authorization Code + PKCE, system browser, loopback redirect); SSO later.
  - `ModelGateway` — keep the app's existing AI provider selection.
  - `KnowledgeSource` — no source wired; explicit disabled default.
- Adapter selection is driven by `TenantConfig`; unknown kinds fail closed.
- Define Google token/claims expectations: issuer `https://accounts.google.com`, audience = client ID, subject, email/domain restriction, expiry, revocation.
- Keep the current behavior as the default adapter (the product has no enterprise login yet).

**Deliverables**

- Interface specifications with method contracts and error codes.
- Default adapters preserving current behavior.
- A test-only fake adapter for each interface.
- Contract tests covering success, denial, expiry, revocation, and malformed responses.
- A dependency rule: feature code must not import a vendor SDK/client directly.
- Google client ID/domain policy and token storage stay in the design for the Google adapter phase, not in P0-2 code.

**Verification**

- Existing auth/provider tests pass unchanged (or with only test wiring changes).
- A fake adapter can be selected in tests without touching feature code.
- No direct vendor import outside the adapter directory.
- Auth guards and token audiences are unchanged.
- Changing the tenant config changes branding/endpoints in the running app without a rebuild.
- The renderer snapshot contains no secret references or values.
- Typecheck and test suite pass.

**Prerequisite:** P0-1 (adapter selection comes from tenant config). **Estimate:** 4–6 days.

---

## P0-3 — Overlay and hook budget

**Goal:** Define the new overlay layer and its upstream-hook budget before product code is added.

**Scope**

- Define the overlay directory layout (new code, assets, build hooks, tests).
- Define the upstream hook ledger: file, line, purpose, owner, rollback, round.
- Define the hard cap for upstream-file modifications and the checker behavior.
- Define how overlay files are registered and how unlisted files fail CI.
- Define how upstream syncs are performed and how conflicts are resolved.

**Deliverables**

- Overlay layout and naming rules.
- `PATCHES.md`-style ledger template.
- A checker (or adapted checker) that:
  - fails on an unlisted upstream modification;
  - fails above the cap;
  - reports the exact file/line and rollback note.
- Baseline result for upstream v0.12.11: zero unlisted changes before product work.
- Documentation for adding/removing a hook.

**Verification**

- Baseline run passes on a clean upstream checkout.
- A deliberately unlisted overlay file fails the check.
- A 22nd upstream modification fails the cap.
- `git diff --check` and documentation links pass.

**Prerequisite:** none. **Estimate:** 2–3 days.

---

## P0-4 — Server tenant boundary and audit skeleton

**Goal:** Define the server-side tenant boundary and the minimum audit contract without deploying or changing a server.

**Scope**

- Document the control-plane/data-plane boundary from `docs/plan.md` §5.1.
- Define the `tenant.yaml` server profile: tenant ID, IdP reference, knowledge source, model gateway, template registry, retention, feature flags.
- Define secret references and rotation metadata; never values.
- Define the audit event schema: tenant, actor, action, resource, result, request ID, timestamp, redacted client metadata.
- Define isolation rules for MVP: per-tenant database/schema, object bucket, secret namespace, and runtime namespace.
- Define the minimum observability contract: health, readiness, request ID, structured error code.

**Deliverables**

- Server tenant-config schema and example.
- Control/data-plane responsibility table.
- Audit event schema and retention policy.
- Isolation checklist for self-host and managed-cloud deployments.
- Logging rules: no tokens, cookies, query values, or PII.

**Verification**

- Schemas validate the example and reject missing required fields.
- A secret-scan of the example finds no values.
- Audit sample contains no token/session/PII fields.
- Isolation checklist covers database, storage, secrets, network, and logs.
- Documentation review by devops/security.

**Prerequisite:** P0-1. **Estimate:** 2–3 days.

---

## P0-5 — Release pipeline design (devops-owned)

**Goal:** Define the release/update model without implementing it in this phase.

**Scope**

- Signed update manifest: channel, version, platform/arch, SHA-256, minimum OS, notes, rollback pointer.
- Channels/rings: stable/beta, and whether an enterprise pilot ring is needed.
- Signing ownership, key rotation, and revocation.
- Public vs private release repository and feed provider choice.
- Staged rollout, failure detection, and rollback procedure.
- Compatibility rule: server contract must support the oldest supported client; server deploys before stable channel opens.

**Deliverables**

- A design document owned by devops (link from this plan; do not duplicate here).
- Manifest schema and example.
- Release checklist and rollback runbook.
- Decision list for unresolved items (keys, feed host, channels).

**Verification**

- Design reviewed by devops and the product owner.
- Manifest example validates and contains no secrets.
- Rollback procedure is testable on a staging artifact.
- No code or pipeline is changed in this phase.

**Prerequisite:** can run in parallel; final sign-off before P0-6. **Estimate:** 1–2 days (design only).

---

## P0-6 — Phase 0 integration gate

**Goal:** Verify that the Phase 0 pieces work together on a clean checkout and that no existing behavior regressed.

**Scope**

- Fresh checkout of the branch under test; no local state.
- Start with the default profile; then switch to a second test tenant profile.
- Select fake adapters for identity/knowledge/model in tests.
- Run the full test/typecheck/overlay checks.
- Review documentation links and secret-scan results.

**Acceptance checklist**

- [ ] Default profile starts without a tenant file.
- [ ] Second profile changes endpoint/branding without a rebuild.
- [ ] Invalid profile fails closed with a readable error.
- [ ] Fake adapters work through the public interfaces.
- [ ] Vendor imports exist only in adapters.
- [ ] Overlay checker passes at baseline and rejects unlisted changes.
- [ ] Audit sample has no secrets/PII.
- [ ] Release design and rollback runbook are linked and reviewed.
- [ ] No secrets, internal domains, IPs, or personal paths in new docs.

**Prerequisite:** P0-1 through P0-5. **Estimate:** 1–2 days.

---

## 4. Out of scope for Phase 0

- Implementing Google login, SSO (OIDC/SAML/LDAP) providers or SCIM. Google login is Phase 1; SSO is the last stage.
- Building the knowledge ingestion pipeline or search index.
- Building the template authoring/approval UI.
- Deploying server changes or enabling a public release.
- Windows/macOS signing implementation.
- Multi-tenant shared SaaS.

These belong to Phase 1/2 and require separate approval.

## 5. Phase 0 exit criteria

Phase 0 is done when:

1. Runtime tenant configuration is the only way endpoints/branding are selected.
2. The integration contracts (`IdentityProvider`, `ModelGateway`, `KnowledgeSource`) have interfaces, default adapters, and contract tests.
3. The overlay ledger and checker enforce the hook budget on a clean upstream baseline.
4. The server tenant boundary, audit schema, and isolation checklist are documented.
5. The release/update design and rollback procedure are reviewed.
6. The integration gate passes on a clean checkout.

## 6. Open questions

- Which configuration format wins for desktop tenants: JSON, YAML, or a signed bundle? (P0-1)
- Where do tenant secrets live on desktop vs server: OS keychain, secret manager, or both? (P0-1/P0-4)
- Google login: which OAuth client/domain restriction policy (Workspace `hd`, account linking) is required? (Google adapter phase)
- Is the release feed public, private, or split from the source repository? (P0-5)
- Which ring model is required for enterprise updates? (P0-5)
