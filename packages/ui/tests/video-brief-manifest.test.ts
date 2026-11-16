import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ledger from '../src/authoring/builtin-templates.json'
import {
  builtinTemplateEntries,
  parseTemplateManifest,
  resolveVideoBrief,
  templateEntryProblems,
  templateManifestProblems,
} from '../src/authoring/manifest'
import { videoAuthoringGuide } from '../src/authoring/guides'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const IDS = [
  'product-promo',
  'training-explainer',
  'kpi-highlight',
  'announcement-teaser',
  'product-3d-showcase',
]
const KO_NAMES = [
  '제품·서비스 소개 모션그래픽',
  '사내 교육 설명 영상',
  '데이터·실적 하이라이트',
  '공지·이벤트 티저',
  '3D 제품 쇼케이스',
]
const EN_NAMES = [
  'Product and service motion graphic',
  'Internal training explainer',
  'Performance highlight',
  'Announcement or event teaser',
  '3D product showcase',
]
const SPINES: Record<string, string[]> = {
  'product-promo': ['opening-logo', 'problem', 'solution', 'features', 'close'],
  'training-explainer': ['title', 'why', 'steps', 'summary', 'check'],
  'kpi-highlight': ['title', 'key-numbers', 'trend', 'changes', 'close'],
  'announcement-teaser': ['hook', 'facts', 'when-where', 'cta'],
  'product-3d-showcase': ['entrance', 'orbit', 'callouts', 'close'],
}

describe('video brief ledger', () => {
  it('is a valid version 1 builtin manifest with five video briefs in order', () => {
    expect(templateManifestProblems(ledger)).toEqual([])
    const manifest = parseTemplateManifest(ledger)
    expect(manifest.version).toBe(1)
    expect(manifest.scope).toBe('builtin')
    const briefs = builtinTemplateEntries('video-brief')
    expect(briefs).toHaveLength(5)
    expect(briefs.map((entry) => entry.id)).toEqual(IDS)
    expect(briefs.map((entry) => entry.name)).toEqual(KO_NAMES)
  })

  it('keeps the existing document and slide brief counts unchanged', () => {
    expect(builtinTemplateEntries('document-brief')).toHaveLength(15)
    expect(builtinTemplateEntries('slide-brief')).toHaveLength(4)
    expect(builtinTemplateEntries('slide-design')).toHaveLength(12)
    expect(ledger.entries).toHaveLength(36)
  })

  it('records self-authored Apache-2.0 entries with four bilingual questions', () => {
    for (const entry of builtinTemplateEntries('video-brief')) {
      expect(entry.kind, entry.id).toBe('video-brief')
      expect(entry.version, entry.id).toBe('1.0.0')
      expect(entry.license, entry.id).toBe('Apache-2.0')
      expect(entry.source, entry.id).toEqual({ type: 'self' })
      expect(entry.author, entry.id).toBe('NaddleOffice')
      expect(entry.locale, entry.id).toBe('ko')
      expect(entry.locales, entry.id).toEqual(['ko', 'en'])
      expect(entry.sha256, entry.id).toBeNull()
      expect(Object.hasOwn(entry, 'scheme'), entry.id).toBe(false)
      expect(Object.hasOwn(entry, 'formAsset'), entry.id).toBe(false)
      expect(entry.nameI18n.ko.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.nameI18n.en.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.category, entry.id).toBe('기업 영상')
      expect(entry.categoryI18n?.en, entry.id).toBe('Business video')
      expect(entry.questions, entry.id).toHaveLength(4)
      expect(
        entry.questions.some((question) => question.required),
        entry.id,
      ).toBe(true)
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

  it('uses the planned scene spine and duration limits', () => {
    const expected = {
      'product-promo': [20, 30, 25],
      'training-explainer': [45, 90, 60],
      'kpi-highlight': [20, 40, 30],
      'announcement-teaser': [10, 20, 15],
      'product-3d-showcase': [15, 30, 20],
    } as const
    for (const entry of builtinTemplateEntries('video-brief')) {
      expect(
        entry.sections.map((section) => section.id),
        entry.id,
      ).toEqual(SPINES[entry.id])
      const [min, max, fallback] = expected[entry.id]
      expect(entry.video.durationSec, entry.id).toEqual({ min, max, default: fallback })
      expect(entry.video.durationSec.max, entry.id).toBeLessThanOrEqual(90)
      expect(entry.video.aspects, entry.id).toEqual(['16:9', '9:16', '1:1'])
    }
    expect(
      builtinTemplateEntries('video-brief').find((entry) => entry.id === 'product-3d-showcase')
        ?.video,
    ).toMatchObject({ libraries: ['three'], requiresWebGL: true })
    for (const entry of builtinTemplateEntries('video-brief').filter(
      (brief) => brief.id !== 'product-3d-showcase',
    )) {
      expect(entry.video.libraries).not.toContain('three')
      expect(entry.video.requiresWebGL, entry.id).toBe(false)
    }
  })

  it('resolves names and questions into the active UI language', () => {
    const briefs = builtinTemplateEntries('video-brief')
    for (const [index, entry] of briefs.entries()) {
      const en = resolveVideoBrief(entry, 'en')
      const ko = resolveVideoBrief(entry, 'ko-KR')
      expect(en.name, entry.id).toBe(EN_NAMES[index])
      expect(ko.name, entry.id).toBe(KO_NAMES[index])
      expect(en.video, entry.id).toEqual(entry.video)
      expect(en.questions[0].label, entry.id).not.toBe(ko.questions[0].label)
    }
  })

  it('rejects missing copy, wrong question counts, scheme, form assets and bad video limits', () => {
    const base = clone(builtinTemplateEntries('video-brief')[0]) as unknown as Record<
      string,
      unknown
    >
    expect(templateEntryProblems({ ...base, nameI18n: { ko: 'x' } }, 'builtin')).toContain(
      'nameI18n must have non-empty ko and en text',
    )
    expect(
      templateEntryProblems({ ...base, nameI18n: { ko: 'x', en: 'y' }, questions: [] }, 'builtin'),
    ).toContain('video-brief must have exactly four questions')

    const questions = (base.questions as unknown[]).slice(0, 3)
    expect(templateEntryProblems({ ...base, questions }, 'builtin')).toContain(
      'video-brief must have exactly four questions',
    )
    expect(templateEntryProblems({ ...base, scheme: 'light' }, 'builtin')).toContain(
      'video-brief must not set scheme',
    )
    expect(
      templateEntryProblems(
        { ...base, formAsset: { path: 'assets/양식.hwpx' }, sha256: 'a'.repeat(64) },
        'builtin',
      ),
    ).toContain('video-brief must not set formAsset')

    const video = base.video as Record<string, unknown>
    expect(templateEntryProblems({ ...base, video: undefined }, 'builtin')).toContain(
      'video is required',
    )
    expect(
      templateEntryProblems(
        {
          ...base,
          video: { ...video, durationSec: { min: 80, max: 91, default: 85 } },
        },
        'builtin',
      ),
    ).toContain('video.durationSec must satisfy 1 <= min <= default <= max <= 90')
    expect(
      templateEntryProblems({ ...base, video: { ...video, aspects: ['16:9', '4:3'] } }, 'builtin'),
    ).toContain('video.aspects may only be 16:9, 9:16 or 1:1')
    expect(
      templateEntryProblems(
        { ...base, video: { ...video, libraries: ['waapi', 'gsap'] } },
        'builtin',
      ),
    ).toContain('video.libraries may only be waapi, anime or three')
    expect(
      templateEntryProblems(
        { ...base, video: { ...video, libraries: ['three'], requiresWebGL: false } },
        'builtin',
      ),
    ).toContain('video.requiresWebGL must be true when three.js is used')
    expect(
      templateEntryProblems({ ...base, video: { ...video, requiresWebGL: 'yes' } }, 'builtin'),
    ).toContain('video.requiresWebGL must be a boolean')
  })
})

describe('video authoring guide', () => {
  it('returns non-empty Korean and English guidance from our own words', () => {
    const ko = videoAuthoringGuide('ko')
    const en = videoAuthoringGuide('en-US')
    expect(ko).toContain('영상 브리프 작성 지침')
    expect(en).toContain('Video brief guidance')
    expect(ko.trim().length).toBeGreaterThan(0)
    expect(en.trim().length).toBeGreaterThan(0)
    expect(ko).not.toBe(en)
  })

  it('carries the page contract and the banned features without third-party text', () => {
    for (const guide of [videoAuthoringGuide('ko'), videoAuthoringGuide('en')]) {
      expect(guide).toContain('window.naddleVideo')
      expect(guide).toContain('seek(')
      expect(guide).toContain('GSAP')
      expect(guide).toContain('three.js')
      expect(guide).toContain('<audio>')
      expect(guide).not.toContain('http://')
      expect(guide).not.toContain('https://')
      expect(guide).not.toContain('yihui-dev')
      expect(guide).not.toContain('awesome-opus5-5-videos')
    }
  })
})

describe('video brief notice', () => {
  it('names the five briefs, credits the approach URL and says prompts were not copied', () => {
    const notice = read('NOTICE-NADDLE.md')
    for (const id of IDS) expect(notice, id).toContain(id)
    expect(notice).toContain('https://github.com/yihui-dev/awesome-opus5-5-videos')
    expect(notice).toMatch(/No prompt/i)
    expect(notice).toMatch(/not copied/i)
    expect(notice).toContain('Apache-2.0')
    expect(notice).toMatch(/No ffmpeg binary is shipped/i)
  })
})
