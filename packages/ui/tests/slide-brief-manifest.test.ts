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
import { academicSlideGuide, businessSlideGuide, slideBriefGuide } from '../src/authoring/guides'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const ACADEMIC_SOURCE = {
  type: 'github',
  repo: 'Gabberflast/academic-pptx-skill',
  commit: '9f2b703ffe8d1449851617665ab1ffb3516d54ac',
  path: 'content_guidelines.md',
}
const ACADEMIC_AUTHOR = 'Gabberflast (guidance); adapted by NaddleOffice'
const ACADEMIC_IDS = ['academic-conference', 'academic-seminar', 'thesis-defense', 'grant-briefing']
const ACADEMIC_KO_NAMES = ['학회 발표', '세미나 발표', '학위논문 심사', '연구비 브리핑']
const ACADEMIC_EN_NAMES = [
  'Conference presentation',
  'Seminar presentation',
  'Thesis defense',
  'Grant briefing',
]
const BUSINESS_SOURCE = {
  type: 'github',
  repo: 'crazyykhllc-bit/CyberPPT',
  commit: '980e5576565f0673c67ee41b01d20ed66cb8417c',
  path: 'SKILL.md',
}
const BUSINESS_AUTHOR = 'CyberPPT contributors (guidance); adapted by NaddleOffice'
const BUSINESS_IDS = [
  'executive-briefing',
  'board-report',
  'client-proposal',
  'project-retrospective',
]
const BUSINESS_KO_NAMES = ['경영진 보고', '이사회 자료', '고객 제안서', '프로젝트 회고']
const BUSINESS_EN_NAMES = [
  'Executive briefing',
  'Board report',
  'Client proposal',
  'Project retrospective',
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
const EXEC_SPINE = [
  'title',
  'situation',
  'complication',
  'recommendation',
  'evidence',
  'options',
  'decision-ask',
  'next-steps',
  'appendix',
]
const BOARD_SPINE = [
  'title',
  'situation',
  'performance',
  'complication',
  'risks',
  'recommendation',
  'governance',
  'decision-ask',
  'appendix',
]
const CLIENT_SPINE = [
  'title',
  'situation',
  'complication',
  'approach',
  'value',
  'plan',
  'commercial',
  'next-steps',
  'appendix',
]
const RETRO_SPINE = [
  'title',
  'situation',
  'outcomes',
  'complication',
  'lessons',
  'recommendations',
  'next-steps',
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

const allBriefs = () => builtinTemplateEntries('slide-brief')
const academicBriefs = () =>
  allBriefs().filter((entry) => (ACADEMIC_IDS as readonly string[]).includes(entry.id))
const businessBriefs = () =>
  allBriefs().filter((entry) => (BUSINESS_IDS as readonly string[]).includes(entry.id))

describe('academic slide brief ledger', () => {
  it('is a valid version 1 builtin manifest with the academic four first', () => {
    expect(templateManifestProblems(ledger)).toEqual([])
    const manifest = parseTemplateManifest(ledger)
    expect(manifest.version).toBe(1)
    expect(manifest.scope).toBe('builtin')
    const briefs = allBriefs()
    expect(briefs).toHaveLength(8)
    expect(briefs.slice(0, 4).map((entry) => entry.id)).toEqual(ACADEMIC_IDS)
    expect(academicBriefs().map((entry) => entry.name)).toEqual(ACADEMIC_KO_NAMES)
  })

  it('records the pinned MIT source and bilingual copy for every academic brief', () => {
    for (const entry of academicBriefs()) {
      expect(entry.kind, entry.id).toBe('slide-brief')
      expect(entry.version, entry.id).toBe('1.0.0')
      expect(entry.license, entry.id).toBe('MIT')
      expect(entry.source, entry.id).toEqual(ACADEMIC_SOURCE)
      expect(entry.author, entry.id).toBe(ACADEMIC_AUTHOR)
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
    for (const entry of academicBriefs().filter((brief) =>
      ACADEMIC_IDS.slice(0, 2).includes(brief.id),
    )) {
      expect(
        entry.sections.map((section) => section.id),
        entry.id,
      ).toEqual(COMMON_SPINE)
    }
  })

  it('adds defense and grant section orders', () => {
    const briefs = academicBriefs()
    expect(
      briefs.find((entry) => entry.id === 'thesis-defense')?.sections.map((s) => s.id),
    ).toEqual(THESIS_SPINE)
    expect(
      briefs.find((entry) => entry.id === 'grant-briefing')?.sections.map((s) => s.id),
    ).toEqual(GRANT_SPINE)
  })

  it('resolves academic names and questions into the active UI language', () => {
    const briefs = academicBriefs()
    expect(slideBriefLanguage('ko')).toBe('ko')
    expect(slideBriefLanguage('ko-KR')).toBe('ko')
    expect(slideBriefLanguage('en-US')).toBe('en')
    expect(slideBriefLanguage(null)).toBe('en')
    for (const [index, entry] of briefs.entries()) {
      const en = resolveSlideBrief(entry, 'en')
      const ko = resolveSlideBrief(entry, 'ko-KR')
      expect(en.name, entry.id).toBe(ACADEMIC_EN_NAMES[index])
      expect(ko.name, entry.id).toBe(ACADEMIC_KO_NAMES[index])
      expect(en.questions[0].label, entry.id).not.toBe(ko.questions[0].label)
    }
    const conference = resolveSlideBrief(briefs[0], 'en')
    expect(conference.questions[0].options?.map((option) => option.label)).toContain('10 minutes')
  })

  it('rejects empty questions, scheme and form assets on a slide brief', () => {
    const base = clone(academicBriefs()[0]) as unknown as Record<string, unknown>
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
      if ((entry.round === 'S5' || entry.round === 'S5c') && entry.kind === 'added') {
        paths.add(entry.path)
      }
    }
    for (const path of paths) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(read(path), path).not.toContain(UPSTREAM_PDF)
    }
  })

  it('ships original ko/en academic guides with the MIT credit and no upstream code', () => {
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
    expect(slideBriefGuide('academic-conference', 'ko')).toBe(academicSlideGuide('ko'))
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

describe('business slide brief ledger', () => {
  it('appends the business four after the academic four with bilingual copy', () => {
    const briefs = allBriefs()
    expect(briefs.map((entry) => entry.id)).toEqual([...ACADEMIC_IDS, ...BUSINESS_IDS])
    expect(businessBriefs().map((entry) => entry.id)).toEqual(BUSINESS_IDS)
    expect(businessBriefs().map((entry) => entry.name)).toEqual(BUSINESS_KO_NAMES)
    for (const entry of businessBriefs()) {
      expect(entry.kind, entry.id).toBe('slide-brief')
      expect(entry.version, entry.id).toBe('1.0.0')
      expect(entry.license, entry.id).toBe('MIT')
      expect(entry.source, entry.id).toEqual(BUSINESS_SOURCE)
      expect(entry.author, entry.id).toBe(BUSINESS_AUTHOR)
      expect(entry.locale, entry.id).toBe('ko')
      expect(entry.locales, entry.id).toEqual(['ko', 'en'])
      expect(entry.nameI18n.ko.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.nameI18n.en.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.descriptionI18n?.ko.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.descriptionI18n?.en.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.categoryI18n?.ko, entry.id).toBe('기업 보고')
      expect(entry.categoryI18n?.en, entry.id).toBe('Business reports')
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
        if (question.description !== undefined) {
          expect(
            question.descriptionI18n?.ko.trim().length,
            `${entry.id}:${question.id}`,
          ).toBeGreaterThan(0)
          expect(
            question.descriptionI18n?.en.trim().length,
            `${entry.id}:${question.id}`,
          ).toBeGreaterThan(0)
        }
        if (question.placeholder !== undefined) {
          expect(
            question.placeholderI18n?.ko.trim().length,
            `${entry.id}:${question.id}`,
          ).toBeGreaterThan(0)
          expect(
            question.placeholderI18n?.en.trim().length,
            `${entry.id}:${question.id}`,
          ).toBeGreaterThan(0)
        }
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

  it('uses the four business SCR spines in order', () => {
    const briefs = businessBriefs()
    const spine = (id: string) =>
      briefs.find((entry) => entry.id === id)?.sections.map((section) => section.id)
    expect(spine('executive-briefing')).toEqual(EXEC_SPINE)
    expect(spine('board-report')).toEqual(BOARD_SPINE)
    expect(spine('client-proposal')).toEqual(CLIENT_SPINE)
    expect(spine('project-retrospective')).toEqual(RETRO_SPINE)
  })

  it('resolves business names and questions into the active UI language', () => {
    for (const [index, entry] of businessBriefs().entries()) {
      const en = resolveSlideBrief(entry, 'en')
      const ko = resolveSlideBrief(entry, 'ko-KR')
      expect(en.name, entry.id).toBe(BUSINESS_EN_NAMES[index])
      expect(ko.name, entry.id).toBe(BUSINESS_KO_NAMES[index])
      expect(en.category, entry.id).toBe('Business reports')
      expect(ko.category, entry.id).toBe('기업 보고')
      expect(en.questions[0].label, entry.id).not.toBe(ko.questions[0].label)
    }
  })

  it('ships original ko/en business guides with the MIT credit and no upstream code', () => {
    for (const lang of ['ko', 'en'] as const) {
      const path = `packages/ui/src/authoring/guides/business/${lang}.md`
      const guide = read(path)
      expect(guide, path).toContain('MIT')
      expect(guide, path).toContain('CyberPPT')
      expect(guide, path).toContain('980e5576565f0673c67ee41b01d20ed66cb8417c')
      expect(guide, path).not.toContain('Proprietary')
      expect(guide.toLowerCase(), path).not.toContain('pptxgenjs')
      expect(guide, path).not.toContain('addSlide(')
      expect(guide.toLowerCase(), path).not.toContain('palette')
      expect(guide, path).not.toContain(UPSTREAM_PDF)
    }
    expect(businessSlideGuide('ko')).toContain('기업 보고 슬라이드 작성 지침')
    expect(businessSlideGuide('en-US')).toContain('Business slide brief guidance')
    expect(businessSlideGuide('ko')).not.toBe(academicSlideGuide('ko'))
    expect(slideBriefGuide('executive-briefing', 'en')).toBe(businessSlideGuide('en'))
    expect(slideBriefGuide('unknown', 'en')).toBe('')
  })

  it('credits the CyberPPT source and MIT terms in NOTICE-NADDLE', () => {
    const notice = read('NOTICE-NADDLE.md')
    expect(notice).toContain('https://github.com/crazyykhllc-bit/CyberPPT')
    expect(notice).toContain('980e5576565f0673c67ee41b01d20ed66cb8417c')
    expect(notice).toContain('Copyright (c) 2026 CyberPPT contributors')
    expect(notice).toContain('MIT License')
    expect(notice).toContain('packages/ui/src/authoring/guides/business/ko.md')
    expect(notice).toContain('packages/ui/src/authoring/guides/business/en.md')
    expect(notice).not.toContain(UPSTREAM_PDF)
  })
})
