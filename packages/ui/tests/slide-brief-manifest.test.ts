import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ledger from '../src/authoring/builtin-templates.json'
import {
  builtinTemplateEntries,
  parseTemplateManifest,
  resolveSlideBrief,
  slideBriefLanguage,
  templateEntryProblems,
  templateManifestProblems,
} from '../src/authoring/manifest'
import { academicSlideGuide } from '../src/authoring/guides'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const SOURCE = {
  type: 'github',
  repo: 'Gabberflast/academic-pptx-skill',
  commit: '9f2b703ffe8d1449851617665ab1ffb3516d54ac',
  path: 'content_guidelines.md',
}
const AUTHOR = 'Gabberflast (guidance); adapted by NaddleOffice'
const IDS = ['academic-conference', 'academic-seminar', 'thesis-defense', 'grant-briefing']
const KO_NAMES = ['학회 발표', '세미나 발표', '학위논문 심사', '연구비 브리핑']
const EN_NAMES = [
  'Conference presentation',
  'Seminar presentation',
  'Thesis defense',
  'Grant briefing',
]
const COMMON_SPINE = [
  'title',
  'motivation',
  'research-question',
  'methods',
  'results',
  'discussion',
  'conclusions',
  'references',
  'appendix',
]
const THESIS_SPINE = [
  'title',
  'motivation',
  'research-question',
  'related-work',
  'methods',
  'results',
  'discussion',
  'contributions',
  'conclusions',
  'references',
  'appendix',
]
const GRANT_SPINE = [
  'title',
  'motivation',
  'aims',
  'methods',
  'work-plan',
  'team',
  'impact',
  'budget',
  'risks',
  'conclusions',
  'references',
  'appendix',
]
const UPSTREAM_PDF =
  [
    'Academic',
    'Presentation',
    'Best',
    'Practices',
    'DH',
    'built',
    'with',
    'Claude',
    '2',
    '2026',
  ].join('_') + '.pdf'

describe('academic slide brief ledger', () => {
  it('is a valid version 1 builtin manifest with four slide briefs in order', () => {
    expect(templateManifestProblems(ledger)).toEqual([])
    const manifest = parseTemplateManifest(ledger)
    expect(manifest.version).toBe(1)
    expect(manifest.scope).toBe('builtin')
    const briefs = builtinTemplateEntries('slide-brief')
    expect(briefs).toHaveLength(4)
    expect(briefs.map((entry) => entry.id)).toEqual(IDS)
    expect(briefs.map((entry) => entry.name)).toEqual(KO_NAMES)
  })

  it('records the pinned MIT source and bilingual copy for every brief', () => {
    for (const entry of builtinTemplateEntries('slide-brief')) {
      expect(entry.kind, entry.id).toBe('slide-brief')
      expect(entry.version, entry.id).toBe('1.0.0')
      expect(entry.license, entry.id).toBe('MIT')
      expect(entry.source, entry.id).toEqual(SOURCE)
      expect(entry.author, entry.id).toBe(AUTHOR)
      expect(entry.locale, entry.id).toBe('ko')
      expect(entry.locales, entry.id).toEqual(['ko', 'en'])
      expect(entry.nameI18n, entry.id).toEqual({
        ko: expect.any(String),
        en: expect.any(String),
      })
      expect(entry.nameI18n.ko.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.nameI18n.en.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.descriptionI18n?.ko.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.descriptionI18n?.en.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.categoryI18n?.ko, entry.id).toBe('학술 발표')
      expect(entry.categoryI18n?.en, entry.id).toBe('Academic presentations')
      expect(entry.sha256, entry.id).toBeNull()
      expect(Object.hasOwn(entry, 'scheme'), entry.id).toBe(false)
      expect(Object.hasOwn(entry, 'formAsset'), entry.id).toBe(false)
      expect(entry.questions.length, entry.id).toBeGreaterThan(0)
      expect(
        entry.questions.some((question) => question.required),
        entry.id,
      ).toBe(true)
      expect(entry.sections.length, entry.id).toBeGreaterThan(0)
      for (const question of entry.questions) {
        expect(question.labelI18n.ko.trim().length, `${entry.id}:${question.id}`).toBeGreaterThan(0)
        expect(question.labelI18n.en.trim().length, `${entry.id}:${question.id}`).toBeGreaterThan(0)
        for (const option of question.options ?? []) {
          expect(option.labelI18n.ko.trim().length, `${entry.id}:${option.id}`).toBeGreaterThan(0)
          expect(option.labelI18n.en.trim().length, `${entry.id}:${option.id}`).toBeGreaterThan(0)
        }
      }
      for (const section of entry.sections) {
        expect(section.titleI18n.ko.trim().length, `${entry.id}:${section.id}`).toBeGreaterThan(0)
        expect(section.titleI18n.en.trim().length, `${entry.id}:${section.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('uses the common spine for conference and seminar talks', () => {
    const briefs = builtinTemplateEntries('slide-brief')
    for (const entry of briefs.filter((brief) => IDS.slice(0, 2).includes(brief.id))) {
      expect(
        entry.sections.map((section) => section.id),
        entry.id,
      ).toEqual(COMMON_SPINE)
    }
  })

  it('adds defense and grant section orders', () => {
    const briefs = builtinTemplateEntries('slide-brief')
    expect(
      briefs.find((entry) => entry.id === 'thesis-defense')?.sections.map((s) => s.id),
    ).toEqual(THESIS_SPINE)
    expect(
      briefs.find((entry) => entry.id === 'grant-briefing')?.sections.map((s) => s.id),
    ).toEqual(GRANT_SPINE)
  })

  it('resolves names and questions into the active UI language', () => {
    const briefs = builtinTemplateEntries('slide-brief')
    expect(slideBriefLanguage('ko')).toBe('ko')
    expect(slideBriefLanguage('ko-KR')).toBe('ko')
    expect(slideBriefLanguage('en-US')).toBe('en')
    expect(slideBriefLanguage(null)).toBe('en')
    for (const [index, entry] of briefs.entries()) {
      const en = resolveSlideBrief(entry, 'en')
      const ko = resolveSlideBrief(entry, 'ko-KR')
      expect(en.name, entry.id).toBe(EN_NAMES[index])
      expect(ko.name, entry.id).toBe(KO_NAMES[index])
      expect(en.questions[0].label, entry.id).not.toBe(ko.questions[0].label)
    }
    const conference = resolveSlideBrief(briefs[0], 'en')
    expect(conference.questions[0].options?.map((option) => option.label)).toContain('10 minutes')
  })

  it('rejects empty questions, scheme and form assets on a slide brief', () => {
    const base = clone(builtinTemplateEntries('slide-brief')[0]) as unknown as Record<
      string,
      unknown
    >
    expect(templateEntryProblems({ ...base, questions: [] }, 'builtin').length).toBeGreaterThan(0)
    expect(templateEntryProblems({ ...base, scheme: 'light' }, 'builtin')).toContain(
      'slide-brief must not set scheme',
    )
    expect(
      templateEntryProblems(
        { ...base, formAsset: { path: 'assets/양식.hwpx' }, sha256: 'a'.repeat(64) },
        'builtin',
      ),
    ).toContain('slide-brief must not set formAsset')
    expect(templateEntryProblems({ ...base, nameI18n: { ko: 'x' } }, 'builtin')).toContain(
      'nameI18n must have non-empty ko and en text',
    )
  })

  it('keeps the academic upstream PDF out of every S5 path and the notice', () => {
    const hooks = JSON.parse(read('docs/upstream-hooks.json')) as {
      entries: { path: string; kind: string; round: string }[]
    }
    const paths = new Set([
      'packages/ui/src/authoring/builtin-templates.json',
      'NOTICE-NADDLE.md',
      'packages/ui/src/authoring/guides/academic/ko.md',
      'packages/ui/src/authoring/guides/academic/en.md',
    ])
    for (const entry of hooks.entries) {
      if (entry.round === 'S5' && entry.kind === 'added') paths.add(entry.path)
    }
    for (const path of paths) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(read(path), path).not.toContain(UPSTREAM_PDF)
    }
  })

  it('ships original ko/en guides with the MIT credit and no upstream code', () => {
    for (const lang of ['ko', 'en'] as const) {
      const path = `packages/ui/src/authoring/guides/academic/${lang}.md`
      const guide = read(path)
      expect(guide, path).toContain('MIT')
      expect(guide, path).toContain('Gabberflast')
      expect(guide, path).not.toContain('Proprietary')
      expect(guide.toLowerCase(), path).not.toContain('pptxgenjs')
      expect(guide, path).not.toContain('addSlide(')
      expect(guide, path).not.toContain(UPSTREAM_PDF)
    }
    expect(academicSlideGuide('ko')).toContain('학술 발표')
    expect(academicSlideGuide('en-US')).toContain('Academic slide brief guidance')
  })

  it('credits the source and its licence conflict in NOTICE-NADDLE', () => {
    const notice = read('NOTICE-NADDLE.md')
    expect(notice).toContain('https://github.com/Gabberflast/academic-pptx-skill')
    expect(notice).toContain('9f2b703ffe8d1449851617665ab1ffb3516d54ac')
    expect(notice).toContain('MIT License')
    expect(notice).toContain('Copyright (c) 2026 Gabberflast')
    expect(notice).toMatch(/Proprietary[\s\S]*conflict|conflict[\s\S]*Proprietary/i)
    expect(notice).not.toContain(UPSTREAM_PDF)
    expect(notice).not.toMatch(/bundl\w*[^.\n]*PDF/i)
  })
})
