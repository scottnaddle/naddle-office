import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ledger from '../src/authoring/builtin-templates.json'
import {
  BUILTIN_TEMPLATE_MANIFEST,
  builtinTemplateEntries,
  formSkillManifestEntry,
  isFormAssetPath,
  isTemplateLicenseAllowed,
  parseTemplateManifest,
  templateEntryProblems,
  templateManifestProblems,
} from '../src/authoring/manifest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const SHA = 'a'.repeat(64)

/** The folder the ledger lives in; form paths are relative to it. */
const ledgerDir = 'packages/ui/src/authoring'

/** The ten S3 office forms, in ledger order, each with a self-authored .hwpx. */
const S3_FORMS: [string, string][] = [
  ['draft', '기안서'],
  ['purchase-request', '구매품의서'],
  ['trip-request', '출장신청서'],
  ['trip-report', '출장보고서'],
  ['leave-request', '휴가신청서'],
  ['corp-card', '법인카드 사용내역서'],
  ['cooperation', '업무협조전'],
  ['statement', '거래명세서'],
  ['purchase-order', '발주서'],
  ['official-letter', '공문(시행문)'],
]

/** Slide ids in display order, read from the catalog and the template files (no package import). */
function slideIdsFromCatalog(): string[] {
  const dir = 'packages/pipelines/src/slides/templates'
  const catalog = read(`${dir}/catalog.ts`)
  const files = new Map(
    [...catalog.matchAll(/import \{ (\w+) \} from '\.\/([\w-]+)'/g)].map((m) => [m[1], m[2]]),
  )
  const body = catalog.split('= [')[1].split(']')[0]
  return body
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const source = read(`${dir}/${files.get(name)}.ts`)
      return source.match(/\n {2}id: '([^']+)'/)![1]
    })
}

describe('builtin template manifest', () => {
  it('is a valid manifest', () => {
    expect(templateManifestProblems(ledger)).toEqual([])
    expect(BUILTIN_TEMPLATE_MANIFEST.scope).toBe('builtin')
  })

  it('has fifteen document briefs, twelve slide designs and no form skills', () => {
    expect(builtinTemplateEntries('document-brief')).toHaveLength(15)
    expect(builtinTemplateEntries('slide-design')).toHaveLength(12)
    expect(builtinTemplateEntries('form-skill')).toHaveLength(0)
    expect(BUILTIN_TEMPLATE_MANIFEST.entries).toHaveLength(27)
  })

  it('keeps the S1 briefs unchanged', () => {
    const briefs = builtinTemplateEntries('document-brief').slice(0, 5)
    expect(briefs.map((entry) => [entry.id, entry.name])).toEqual([
      ['quote', '견적서'],
      ['approval', '품의서'],
      ['expense', '지출결의서'],
      ['minutes', '회의록'],
      ['report', '업무 보고'],
    ])
    const shape = Object.fromEntries(
      briefs.map((entry) => [
        entry.id,
        {
          questions: entry.questions.map((q) => q.id),
          required: entry.questions.filter((q) => q.required).map((q) => q.id),
          sections: entry.sections.map((s) => `${s.id}:${s.title}`),
        },
      ]),
    )
    expect(shape).toEqual({
      quote: {
        questions: ['customer', 'items', 'tax', 'valid'],
        required: ['customer', 'items', 'tax'],
        sections: [
          'info:견적 정보',
          'items:품목 및 금액',
          'total:합계 및 조건',
          'validity:유효기간 및 서명',
        ],
      },
      approval: {
        questions: ['title', 'purpose', 'amount', 'period', 'requester'],
        required: ['title', 'purpose'],
        sections: [
          'purpose:목적 및 배경',
          'content:내용',
          'budget:예산',
          'schedule:일정',
          'approval:승인',
        ],
      },
      expense: {
        questions: ['date', 'payee', 'amount', 'account', 'purpose'],
        required: ['payee', 'amount', 'purpose'],
        sections: ['summary:지출 개요', 'detail:지출 내역', 'evidence:증빙', 'approval:승인'],
      },
      minutes: {
        questions: ['meeting', 'date', 'attendees', 'agenda'],
        required: ['meeting', 'agenda'],
        sections: [
          'info:회의 정보',
          'discussion:논의',
          'decisions:결정 사항',
          'followup:후속 조치',
        ],
      },
      report: {
        questions: ['period', 'owner', 'summary', 'issues', 'next'],
        required: ['summary'],
        sections: ['summary:요약', 'progress:진행 상황', 'issues:이슈 및 위험', 'next:다음 단계'],
      },
    })
    for (const entry of briefs) {
      expect(entry.license, entry.id).toBe('Apache-2.0')
      expect(entry.source, entry.id).toEqual({ type: 'self' })
      expect(entry.author, entry.id).toBe('NaddleOffice')
      expect(entry.locale, entry.id).toBe('ko')
    }
  })

  it('lists the twelve slide designs in catalog order with their MIT source', () => {
    const slides = builtinTemplateEntries('slide-design')
    expect(slides.map((entry) => entry.id)).toEqual(slideIdsFromCatalog())
    const contract = read('packages/pipelines/src/slides/templates/contract.ts')
    const commit = contract.match(/SLIDE_TEMPLATE_SOURCE_COMMIT = '([0-9a-f]{40})'/)![1]
    for (const entry of slides) {
      expect(entry.license, entry.id).toBe('MIT')
      expect(entry.source, entry.id).toEqual({
        type: 'github',
        repo: 'zarazhangrui/frontend-slides',
        commit,
        path: `bold-template-pack/templates/${entry.id}`,
      })
    }
  })

  it('invents no hashes: entries without a form file carry none', () => {
    for (const entry of BUILTIN_TEMPLATE_MANIFEST.entries) {
      expect(entry.license && entry.author && entry.locale && entry.source, entry.id).toBeTruthy()
      if (entry.formAsset) continue
      expect(entry.sha256 ?? null, entry.id).toBeNull()
    }
    // the S1 briefs and every slide design ship no form file
    for (const entry of [
      ...builtinTemplateEntries('document-brief').slice(0, 5),
      ...builtinTemplateEntries('slide-design'),
    ]) {
      expect(entry.formAsset, entry.id).toBeUndefined()
    }
  })

  it('hashes every shipped form file from its committed bytes', () => {
    const withForm = BUILTIN_TEMPLATE_MANIFEST.entries.filter((entry) => entry.formAsset)
    expect(withForm.map((entry) => entry.id)).toEqual(S3_FORMS.map(([id]) => id))
    for (const entry of withForm) {
      const path = entry.formAsset!.path
      expect(isFormAssetPath(path), entry.id).toBe(true)
      const file = join(root, ledgerDir, path)
      expect(existsSync(file), file).toBe(true)
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex')
      expect(entry.sha256, entry.id).toBe(digest)
    }
  })

  it('lists the ten S3 office forms as self-authored Apache-2.0 briefs', () => {
    const briefs = builtinTemplateEntries('document-brief')
    expect(briefs.slice(5).map((entry) => [entry.id, entry.name])).toEqual(S3_FORMS)
    for (const entry of briefs.slice(5)) {
      expect(entry.kind, entry.id).toBe('document-brief')
      expect(entry.version, entry.id).toBe('1.0.0')
      expect(entry.license, entry.id).toBe('Apache-2.0')
      expect(entry.source, entry.id).toEqual({ type: 'self' })
      expect(entry.author, entry.id).toBe('NaddleOffice')
      expect(entry.locale, entry.id).toBe('ko')
      expect(entry.formAsset, entry.id).toEqual({ path: `assets/${entry.id}.hwpx` })
      expect(entry.questions.length, entry.id).toBeGreaterThanOrEqual(3)
      expect(
        entry.questions.some((question) => question.required),
        entry.id,
      ).toBe(true)
      expect(entry.sections.length, entry.id).toBeGreaterThanOrEqual(3)
    }
    // employment contracts, tax invoices and HR forms are out of scope
    const names = BUILTIN_TEMPLATE_MANIFEST.entries.map((entry) => entry.name)
    for (const banned of [
      '근로계약서',
      '세금계산서',
      '재직증명서',
      '경력증명서',
      '사직서',
      '퇴직원',
      '인사기록카드',
      '연봉계약서',
    ]) {
      expect(
        names.some((name) => name.includes(banned)),
        banned,
      ).toBe(false)
    }
  })
})

describe('manifest validation', () => {
  const brief = () =>
    clone(builtinTemplateEntries('document-brief')[0]) as unknown as Record<string, unknown>

  it('rejects unknown kinds, bad ids and missing metadata', () => {
    expect(templateEntryProblems({ ...brief(), kind: 'macro' }, 'builtin')).toContain(
      'kind is unknown',
    )
    expect(templateEntryProblems({ ...brief(), id: 'Bad Id' }, 'builtin').length).toBeGreaterThan(0)
    for (const key of ['author', 'locale', 'version', 'license', 'source']) {
      const entry = brief()
      delete entry[key]
      expect(templateEntryProblems(entry, 'builtin').length, key).toBeGreaterThan(0)
    }
    expect(templateEntryProblems({ ...brief(), questions: [] }, 'builtin').length).toBeGreaterThan(
      0,
    )
  })

  it('rejects duplicate ids in one kind', () => {
    const doc = clone(ledger) as { entries: unknown[] }
    doc.entries.push(doc.entries[0])
    expect(templateManifestProblems(doc).some((p) => p.includes('duplicate'))).toBe(true)
    expect(() => parseTemplateManifest(doc)).toThrow(/Invalid template manifest/)
  })

  it('requires sha256 exactly when a form file is set', () => {
    expect(
      templateEntryProblems({ ...brief(), formAsset: { path: 'assets/양식.hwpx' } }, 'builtin'),
    ).toContain('sha256 is required (lowercase hex) when formAsset is set')
    expect(
      templateEntryProblems(
        { ...brief(), formAsset: { path: 'assets/양식.hwpx' }, sha256: SHA },
        'builtin',
      ),
    ).toEqual([])
    expect(templateEntryProblems({ ...brief(), sha256: SHA }, 'builtin')).toContain(
      'sha256 must be absent or null without formAsset',
    )
    expect(
      templateEntryProblems(
        { ...brief(), formAsset: { path: '../양식.hwpx' }, sha256: SHA },
        'builtin',
      ),
    ).toContain('formAsset.path must be a file under assets/')
  })

  it('accepts only permissive licenses in builtin and proprietary-tenant only for tenants', () => {
    for (const license of ['Apache-2.0', 'MIT', 'CC0-1.0', 'CC-BY-4.0', 'KOGL-Type1']) {
      expect(isTemplateLicenseAllowed(license, 'builtin'), license).toBe(true)
    }
    for (const license of [
      'CC-BY-NC-4.0',
      'CC-BY-NC-SA-4.0',
      'CC-BY-ND-4.0',
      'KOGL-Type2',
      'KOGL-Type3',
      'KOGL-Type4',
      'personal-free',
      'non-commercial',
      'GPL-3.0-only',
    ]) {
      expect(isTemplateLicenseAllowed(license, 'builtin'), license).toBe(false)
      expect(isTemplateLicenseAllowed(license, 'tenant'), license).toBe(false)
    }
    expect(isTemplateLicenseAllowed('proprietary-tenant', 'builtin')).toBe(false)
    expect(isTemplateLicenseAllowed('proprietary-tenant', 'tenant')).toBe(true)
  })

  it('keeps vendor and marketplace templates out of the builtin ledger', () => {
    for (const author of ['Microsoft', 'Hancom', '한컴', 'Yesform', '비즈폼', 'Google Docs']) {
      expect(templateEntryProblems({ ...brief(), author }, 'builtin'), author).toContain(
        'builtin entries must not bundle vendor or marketplace templates',
      )
    }
    expect(
      templateEntryProblems(
        { ...brief(), source: { type: 'url', url: 'https://templates.office.com/x' } },
        'builtin',
      ),
    ).toContain('builtin entries must not bundle vendor or marketplace templates')
  })

  it('allows tenant sources only in tenant manifests', () => {
    const entry = {
      ...brief(),
      license: 'proprietary-tenant',
      source: { type: 'tenant', pack: 'acme' },
    }
    expect(templateEntryProblems(entry, 'tenant')).toEqual([])
    expect(templateEntryProblems(entry, 'builtin').length).toBeGreaterThan(0)
  })
})

describe('form skill helper', () => {
  it('maps a skill with an ieum-template into a form-skill entry', () => {
    const entry = formSkillManifestEntry({
      name: 'purchase-order',
      title: '발주서',
      description: '발주서 양식을 채웁니다',
      template: 'assets/양식.hwpx',
      skillPath: 'skills/purchase-order',
      license: 'proprietary-tenant',
      source: { type: 'tenant', pack: 'acme' },
      author: 'ACME',
      sha256: SHA,
    })
    expect(entry).toEqual({
      id: 'purchase-order',
      kind: 'form-skill',
      version: '1.0.0',
      name: '발주서',
      description: '발주서 양식을 채웁니다',
      license: 'proprietary-tenant',
      source: { type: 'tenant', pack: 'acme' },
      author: 'ACME',
      locale: 'ko',
      skillPath: 'skills/purchase-order',
      formAsset: { path: 'assets/양식.hwpx' },
      sha256: SHA,
    })
    expect(templateEntryProblems(entry, 'tenant')).toEqual([])
  })

  it('drops a template outside assets/ and flags a missing hash', () => {
    const base = {
      name: 'memo',
      skillPath: 'skills/memo',
      license: 'Apache-2.0',
      source: { type: 'self' as const },
      author: 'NaddleOffice',
    }
    const outside = formSkillManifestEntry({ ...base, template: '../secret.hwpx' })
    expect(outside.formAsset).toBeUndefined()
    expect(outside.sha256).toBeUndefined()
    expect(templateEntryProblems(outside, 'builtin')).toEqual([])
    const unhashed = formSkillManifestEntry({ ...base, template: 'assets/memo.docx' })
    expect(templateEntryProblems(unhashed, 'builtin')).toContain(
      'sha256 is required (lowercase hex) when formAsset is set',
    )
    expect(isFormAssetPath('assets/')).toBe(false)
    expect(isFormAssetPath('assets/a/../b.hwpx')).toBe(false)
  })
})

describe('notices', () => {
  it('keeps the upstream NOTICE verbatim on five skills and reconciles seven in NOTICE-NADDLE', () => {
    const notice = read('NOTICE')
    expect(notice).toContain('the five skills shipped with the')
    const naddle = read('NOTICE-NADDLE.md')
    expect(naddle).toMatch(/seven skills/)
    expect(naddle).toContain('`administration-report`')
    expect(naddle).toContain('`administration-report-draft`')
    expect(naddle).toContain('packages/ui/src/authoring/builtin-templates.json')
    // the S3 forms: self-authored, generated in-repo, no official form or seal copied
    expect(naddle).toContain('packages/ui/scripts/generate-builtin-hwpx-forms.mjs')
    expect(naddle).toContain('결재란')
    expect(naddle).toMatch(/공문\(시행문\) is a structure-only rewrite/)
    expect(naddle).toMatch(/no agency logo or official seal/)
    const skills = JSON.parse(read('apps/shell/resources/builtin-skills/builtin-skills.json')) as {
      name: string
    }[]
    expect(skills).toHaveLength(7)
    expect(skills.slice(5).map((skill) => skill.name)).toEqual([
      'administration-report',
      'administration-report-draft',
    ])
  })
})
