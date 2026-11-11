#!/usr/bin/env node
/**
 * Upstream-hook ledger check (read-only, no network).
 *
 * Compares the working tree with the import commit (`base.importCommit`) and
 * fails when an upstream file was changed or added without an entry in
 * `docs/upstream-hooks.json`, when the counted changes exceed `cap`, or when
 * the ledger itself is malformed.
 *
 * Overlay and governance paths are listed in the ledger and are never counted.
 * Generated files (package-lock.json) need an entry but are not counted.
 *
 * Usage: node tools/check-upstream-hooks.mjs
 *   The clone must contain the import commit (actions/checkout fetch-depth: 0).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEDGER_PATH = 'docs/upstream-hooks.json'

class LedgerError extends Error {}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function repoRoot() {
  try {
    return git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  } catch {
    fail('not inside a git repository; run this from the repository root', 2)
  }
}

function fail(message, code = 1) {
  console.error(`check-upstream-hooks: ${message}`)
  process.exit(code)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readLedger(root) {
  const path = join(root, LEDGER_PATH)
  if (!existsSync(path)) throw new LedgerError(`missing ledger ${LEDGER_PATH}`)
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new LedgerError(`${LEDGER_PATH} is not valid JSON: ${error.message}`)
  }
  return validateLedger(raw)
}

const KINDS = new Set(['modified', 'deleted', 'added'])

export function validateLedger(raw) {
  if (!isRecord(raw)) throw new LedgerError('ledger must be a JSON object')
  const base = raw.base
  if (
    !isRecord(base) ||
    typeof base.importCommit !== 'string' ||
    !/^[0-9a-f]{7,40}$/.test(base.importCommit)
  ) {
    throw new LedgerError('base.importCommit must be a hex commit id')
  }
  if (!Number.isInteger(raw.cap) || raw.cap < 1)
    throw new LedgerError('cap must be a positive integer')
  const warnAt = raw.warnAt === undefined ? raw.cap : raw.warnAt
  if (!Number.isInteger(warnAt) || warnAt > raw.cap) {
    throw new LedgerError('warnAt must be an integer not above cap')
  }
  const list = (key) =>
    raw[key] === undefined
      ? []
      : Array.isArray(raw[key]) && raw[key].every((v) => typeof v === 'string')
        ? raw[key]
        : (() => {
            throw new LedgerError(`${key} must be an array of strings`)
          })()

  const entries = raw.entries
  if (!Array.isArray(entries)) throw new LedgerError('entries must be an array')
  const seen = new Set()
  const byPath = new Map()
  for (const entry of entries) {
    if (!isRecord(entry)) throw new LedgerError('each entry must be an object')
    if (typeof entry.path !== 'string' || !entry.path)
      throw new LedgerError('entry.path is required')
    if (seen.has(entry.path)) throw new LedgerError(`duplicate entry for ${entry.path}`)
    if (!KINDS.has(entry.kind)) {
      throw new LedgerError(`${entry.path}: kind must be modified, deleted or added`)
    }
    for (const field of ['purpose', 'revert']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        throw new LedgerError(`${entry.path}: ${field} is required`)
      }
    }
    seen.add(entry.path)
    byPath.set(entry.path, entry)
  }

  return {
    base,
    cap: raw.cap,
    warnAt,
    entries,
    byPath,
    exemptPrefixes: list('exemptPrefixes'),
    overlayPrefixes: list('overlayPrefixes'),
    exemptPaths: list('exemptPaths'),
    generated: list('generated'),
  }
}

export function isExempt(path, ledger) {
  return (
    ledger.exemptPaths.includes(path) ||
    ledger.exemptPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))
  )
}

export function isOverlay(path, ledger) {
  return ledger.overlayPrefixes.some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
  )
}

export function parseNameStatus(output) {
  const changes = []
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const status = parts[0][0]
    if (status === 'R' || status === 'C') {
      changes.push({ path: parts[1], kind: 'deleted', renameTo: parts[2] })
      changes.push({ path: parts[2], kind: 'added', renameFrom: parts[1] })
    } else if (status === 'A') {
      changes.push({ path: parts[1], kind: 'added' })
    } else if (status === 'D') {
      changes.push({ path: parts[1], kind: 'deleted' })
    } else {
      changes.push({ path: parts[1], kind: 'modified' })
    }
  }
  return changes
}

export function lineRangesFor(diff) {
  const ranges = []
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    if (count === 0) continue
    ranges.push(count === 1 ? `${start}` : `${start}-${start + count - 1}`)
  }
  return ranges.join(', ') || '-'
}

export function evaluate(changes, ledger) {
  const violations = []
  const counted = []
  for (const change of changes) {
    if (isExempt(change.path, ledger) || isOverlay(change.path, ledger)) continue
    const entry = ledger.byPath.get(change.path)
    const generated = ledger.generated.includes(change.path)
    if (!entry) {
      violations.push({ ...change, reason: 'missing ledger entry' })
      continue
    }
    if (entry.kind !== change.kind) {
      violations.push({
        ...change,
        reason: `ledger says ${entry.kind}, repository says ${change.kind}`,
        entry,
      })
      continue
    }
    if (entry.exempt) continue
    if (!generated && change.kind !== 'added') counted.push({ ...change, entry })
  }
  if (counted.length > ledger.cap) {
    violations.push({
      reason: `counted upstream changes ${counted.length} exceed the cap ${ledger.cap}`,
      capViolation: true,
    })
  }
  return {
    violations,
    counted: counted.length,
    warn: counted.length >= ledger.warnAt,
    countedPaths: counted,
  }
}

function describeViolation(violation) {
  if (violation.capViolation) return [`cap: ${violation.reason}`]
  const lines = []
  lines.push(`  ${violation.kind === 'added' ? '+' : '-'} ${violation.path} (${violation.kind})`)
  if (violation.lines) lines.push(`    lines: ${violation.lines}`)
  lines.push(`    ${violation.reason}`)
  if (violation.entry) {
    lines.push(`    purpose: ${violation.entry.purpose}`)
    lines.push(`    revert: ${violation.entry.revert}`)
  } else {
    lines.push(`    fix: add a ${violation.kind} entry to ${LEDGER_PATH} with purpose and revert`)
  }
  return lines
}

function main() {
  const root = repoRoot()
  let ledger
  try {
    ledger = readLedger(root)
  } catch (error) {
    fail(error.message)
  }

  try {
    git(root, ['cat-file', '-e', `${ledger.base.importCommit}^{commit}`])
  } catch {
    fail(
      `base import commit ${ledger.base.importCommit} not found. ` +
        'This clone is shallow or the import commit is gone. ' +
        'Fetch full history (actions/checkout fetch-depth: 0) and retry.',
      2,
    )
  }

  const status = git(root, ['diff', '--name-status', '-M', ledger.base.importCommit])
  const changes = parseNameStatus(status)
  for (const path of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')) {
    if (path.trim()) changes.push({ path: path.trim(), kind: 'added' })
  }
  for (const change of changes) {
    if (change.kind === 'added' || change.kind === 'deleted') continue
    const diff = git(root, ['diff', '-U0', ledger.base.importCommit, '--', change.path])
    change.lines = lineRangesFor(diff)
  }
  for (const change of changes) {
    if (change.kind !== 'added') continue
    const full = join(root, change.path)
    if (existsSync(full) && statSync(full).isFile()) {
      const text = readFileSync(full, 'utf8')
      const count = text.length === 0 ? 1 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
      change.lines = count === 1 ? '1' : `1-${count}`
    }
  }

  // Exempt entries (for example .github/workflows/ci.yml) are recorded but not
  // compared: the import commit intentionally has no .github tree.
  for (const entry of ledger.entries) {
    if (!entry.exempt) continue
    if (!existsSync(join(root, entry.path))) {
      fail(`${entry.path}: exempt ledger entry points at a file that does not exist`)
    }
  }

  const result = evaluate(changes, ledger)
  if (result.violations.length > 0) {
    console.error('check-upstream-hooks: upstream hook ledger violations:')
    for (const violation of result.violations) {
      for (const line of describeViolation(violation)) console.error(line)
    }
    console.error(
      `\nmodified ${changes.filter((c) => c.kind === 'modified').length} / ` +
        `deleted ${changes.filter((c) => c.kind === 'deleted').length} / ` +
        `added ${changes.filter((c) => c.kind === 'added').length} / ` +
        `counted ${result.counted}/${ledger.cap}`,
    )
    process.exit(1)
  }

  const generated = ledger.generated.filter((path) =>
    changes.some((change) => change.path === path),
  ).length
  const exempt = ledger.entries.filter((entry) => entry.exempt).length
  const registeredAdds = changes.filter(
    (change) =>
      change.kind === 'added' && !isExempt(change.path, ledger) && !isOverlay(change.path, ledger),
  ).length
  const warn = result.warn
    ? ` WARNING: counted ${result.counted} reached warnAt ${ledger.warnAt}`
    : ''
  console.log(
    `check-upstream-hooks: OK — counted ${result.counted}/${ledger.cap}, ` +
      `registered additions ${registeredAdds}, exempt ${exempt}, generated ${generated}` +
      `${warn}`,
  )
  return 0
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
