# Built-in public keys

This folder holds the public halves of keys the app ships as trust roots for
official Naddle packs. The runtime reads the constants in
`src/trust/builtin-keys.ts`, and a test keeps the two in step.

S4c ships **no key**. The built-in list is empty. A key is added only after a
separate decision names the key, its owner and where the private half is stored
offline. Tenant administrators register their own public keys in
Settings → Company forms → Signing keys; no key file is needed in this folder
for that path.

Private keys must never be committed here or anywhere else in the repository.
Test keys are generated at runtime in the system temporary folder.
