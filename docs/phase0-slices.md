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

**Goal:** Replace build-time JSON constants with a validated runtime tenant configuration.

**Scope**
- Define a `TenantConfig` schema covering: product/brand, policy, authentication provider selection, knowledge source, model gateway, template catalog, retention/feature flags.
- Loader precedence: explicit environment/file override → tenant config file → safe development default.
- Migrate the five static JSON imports identified in `docs/plan.md` §3.4 to the loader.
- Keep the existing configuration as an example/default profile; do not require an enterprise tenant to build.
- Secret values are referenced by name/path only; no secret values in config or logs.

**Deliverables**
- Versioned schema and validation (unknown keys rejected or explicitly ignored).
- Loader with deterministic precedence and clear error messages.
- Default/example tenant profile.
- Tests for precedence, invalid/missing config, secret redaction, and startup with no tenant file.
- Documentation for operators: where the file lives, permissions, override variables, rollback.

**Verification**
- No remaining static imports of the five build-time JSON files.
- Changing the tenant config changes endpoints/branding without rebuilding.
- Invalid config fails closed with a readable error; no secret appears in logs.
- Existing default app build still starts and its tests pass.
- `git diff --check`, typecheck, and the project's test suite pass.

**Prerequisite:** none. **Estimate:** 3–5 days.

---

## P0-2 — Integration and authentication boundaries

**Goal:** Make the four integration seams explicit and provider-neutral, with the current vendor implementation moved behind an adapter.

**Scope**
- Define interfaces and error taxonomy for:
  - `DaouClient` (identity interaction)
  - `OfficeBrokerClient` (session/token/profile)
  - `RelayClient` (model gateway)
  - `WikiApiClient` (knowledge source)
- Define an adapter-selection contract driven by `TenantConfig`.
- Move the current vendor-specific implementation into an adapter without changing its behavior.
- Define token/claims expectations: issuer, audience, subject, roles, expiry, revocation.
- Keep the existing login flow as the default adapter.

**Deliverables**
- Interface specifications with method contracts and error codes.
- Default adapter preserving current behavior.
- A test-only fake adapter for each interface.
- Contract tests covering success, denial, expiry, revocation, and malformed responses.
- A dependency rule: feature code must not import a vendor SDK/client directly.

**Verification**
- Existing login/session/wiki tests pass unchanged (or with only test wiring changes).
- A fake adapter can be selected in tests without touching feature code.
- No direct vendor import outside the adapter directory.
- Auth guards and token audiences are unchanged.
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

- Implementing OIDC/SAML/LDAP providers or SCIM.
- Building the knowledge ingestion pipeline or search index.
- Building the template authoring/approval UI.
- Deploying server changes or enabling a public release.
- Windows/macOS signing implementation.
- Multi-tenant shared SaaS.

These belong to Phase 1/2 and require separate approval.

## 5. Phase 0 exit criteria

Phase 0 is done when:

1. Runtime tenant configuration is the only way endpoints/branding are selected.
2. The four integration seams have interfaces, default adapters, and contract tests.
3. The overlay ledger and checker enforce the hook budget on a clean upstream baseline.
4. The server tenant boundary, audit schema, and isolation checklist are documented.
5. The release/update design and rollback procedure are reviewed.
6. The integration gate passes on a clean checkout.

## 6. Open questions

- Which configuration format wins for desktop tenants: JSON, YAML, or a signed bundle? (P0-1)
- Where do tenant secrets live on desktop vs server: OS keychain, secret manager, or both? (P0-1/P0-4)
- Does the first enterprise customer require SAML at MVP, or is OIDC sufficient? (P0-2)
- Is the release feed public, private, or split from the source repository? (P0-5)
- Which ring model is required for enterprise updates? (P0-5)
