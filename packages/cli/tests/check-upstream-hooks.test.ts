import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { tempDir } from './helpers'

const SCRIPT = join(__dirname, '../../../tools/check-upstream-hooks.mjs')

let repo: string
let base: string

function run(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function write(path: string, body: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), body)
}

function commitBase(files: Record<string, string>): void {
  for (const [path, body] of Object.entries(files)) write(path, body)
  run(['add', '-A'], repo)
  run(['commit', '-m', 'base'], repo)
  base = run(['rev-parse', 'HEAD'], repo).trim()
}

function ledger(overrides: Record<string, unknown> = {}): void {
  write(
    'docs/upstream-hooks.json',
    JSON.stringify(
      {
        base: { importCommit: base },
        cap: 90,
        warnAt: 85,
        entries: [],
        exemptPrefixes: ['.github/', 'docs/'],
        overlayPrefixes: [],
        ...overrides,
      },
      null,
      2,
    ) + '\n',
  )
}

function entry(path: string, kind: string, extra: Record<string, unknown> = {}) {
  return {
    path,
    kind,
    purpose: 'recorded purpose',
    revert: 'delete the hook line',
    round: 'test',
    owner: 'test',
    ...extra,
  }
}

function check(): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf8' })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

beforeEach(() => {
  repo = tempDir()
  run(['init', '-q'], repo)
  run(['config', 'user.email', 'test@example.com'], repo)
  run(['config', 'user.name', 'test'], repo)
  run(['config', 'commit.gpgsign', 'false'], repo)
})

describe('check-upstream-hooks', () => {
  it('passes when every counted change is in the ledger', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger({ entries: [entry('upstream.txt', 'modified')] })
    write('upstream.txt', 'one\ntwo\n')
    const result = check()
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('counted 1/90')
  })

  it('fails on a modified upstream file with no ledger entry', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger()
    write('upstream.txt', 'one\ntwo\n')
    const result = check()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('upstream.txt (modified)')
    expect(result.stderr).toContain('missing ledger entry')
    expect(result.stderr).toContain('docs/upstream-hooks.json')
  })

  it('fails when counted changes exceed the cap', () => {
    commitBase({ 'a.txt': 'one\n', 'b.txt': 'one\n' })
    ledger({ cap: 1, warnAt: 1, entries: [entry('a.txt', 'modified'), entry('b.txt', 'modified')] })
    write('a.txt', 'two\n')
    write('b.txt', 'two\n')
    const result = check()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('exceed the cap 1')
  })

  it('fails on an unregistered new file under an upstream path', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger()
    write('apps/shell/src/new-hook.ts', 'export {}\n')
    const result = check()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('+ apps/shell/src/new-hook.ts (added)')
    expect(result.stderr).toContain('add a added entry')
  })

  it('accepts a registered addition', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger({ entries: [entry('apps/shell/src/new-hook.ts', 'added')] })
    write('apps/shell/src/new-hook.ts', 'export {}\n')
    expect(check().code).toBe(0)
  })

  it('ignores governance and overlay paths', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger({ overlayPrefixes: ['packages/tenant-config/'] })
    write('.github/workflows/ci.yml', 'name: CI\n')
    write('packages/tenant-config/src/new.ts', 'export {}\n')
    expect(check().code).toBe(0)
  })

  it('prints the changed lines and the revert instruction for a wrong kind', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    ledger({ entries: [entry('upstream.txt', 'added')] })
    write('upstream.txt', 'one\ntwo\n')
    const result = check()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('lines: 2')
    expect(result.stderr).toContain('ledger says added, repository says modified')
    expect(result.stderr).toContain('revert: delete the hook line')
  })

  it('fails on malformed ledger JSON', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    write('docs/upstream-hooks.json', '{ not json')
    const result = check()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('not valid JSON')
  })

  it('fails clearly when the import commit is missing (shallow clone)', () => {
    commitBase({ 'upstream.txt': 'one\n' })
    write(
      'docs/upstream-hooks.json',
      JSON.stringify({
        base: { importCommit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
        cap: 90,
        entries: [],
      }),
    )
    const result = check()
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('not found')
    expect(result.stderr).toContain('fetch-depth: 0')
  })
})
