import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { academicSlideGuide } from '@genoffice/ui'
import { AuthoringFlow } from '../src/renderer/ai/AuthoringFlow'
import {
  SLIDE_BRIEFS,
  buildSlideBrief,
  buildSlideBriefPrompt,
  slideBrief,
  slideBriefsFor,
} from '../src/renderer/ai/authoring/templates'

const IDS = ['academic-conference', 'academic-seminar', 'thesis-defense', 'grant-briefing']
const KO_NAMES = ['학회 발표', '세미나 발표', '학위논문 심사', '연구비 브리핑']
const EN_NAMES = [
  'Conference presentation',
  'Seminar presentation',
  'Thesis defense',
  'Grant briefing',
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

describe('academic slide briefs', () => {
  it('lists four briefs with Korean defaults and English copy', () => {
    expect(SLIDE_BRIEFS.map((template) => template.id)).toEqual(IDS)
    expect(SLIDE_BRIEFS.map((template) => template.name)).toEqual(KO_NAMES)
    const english = slideBriefsFor('en-US')
    expect(english.map((template) => template.id)).toEqual(IDS)
    expect(english.map((template) => template.name)).toEqual(EN_NAMES)
    for (const template of SLIDE_BRIEFS) {
      expect(template.questions.length, template.id).toBeGreaterThan(0)
      expect(template.sections.length, template.id).toBeGreaterThan(0)
    }
  })

  it('builds the defense and grant briefs locally with their fixed sections', () => {
    const defense = slideBrief('thesis-defense', 'ko')
    const grant = slideBrief('grant-briefing', 'ko')
    expect(defense).toBeTruthy()
    expect(grant).toBeTruthy()
    expect(buildSlideBrief(defense!, {}).sections.map((section) => section.id)).toEqual(
      THESIS_SPINE,
    )
    expect(buildSlideBrief(grant!, {}).sections.map((section) => section.id)).toEqual(GRANT_SPINE)
  })

  it('writes a Korean prompt with answers, section order and the Korean guide', () => {
    const template = slideBrief('thesis-defense', 'ko')!
    const answers = {
      degree: 'master',
      'research-question': '표본이 작을 때도 일반화할 수 있는가?',
      contributions: '새 측정 지표',
    }
    const brief = buildSlideBrief(template, answers)
    const prompt = buildSlideBriefPrompt(template, answers, brief, 'ko')
    expect(prompt).toContain(template.name)
    expect(prompt).toContain('표본이 작을 때도 일반화할 수 있는가?')
    expect(prompt).toContain('1. 제목')
    expect(prompt).toContain('11. 부록')
    expect(prompt).toContain('문서가 아니라 발표용 슬라이드 덱입니다')
    expect(prompt).toContain(academicSlideGuide('ko'))
    expect(prompt).not.toContain('Academic slide brief guidance')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })

  it('writes an English prompt with the English guide', () => {
    const template = slideBrief('academic-conference', 'en')!
    const answers = { length: '10', claim: 'State the claim first.' }
    const brief = buildSlideBrief(template, answers)
    const prompt = buildSlideBriefPrompt(template, answers, brief, 'en')
    expect(prompt).toContain('Conference presentation')
    expect(prompt).toContain('State the claim first.')
    expect(prompt).toContain('1. Title')
    expect(prompt).toContain('slide deck for a talk, not a document')
    expect(prompt).toContain(academicSlideGuide('en'))
    expect(prompt).not.toContain('학술 발표 슬라이드 작성 지침')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })
})

describe('slides authoring gallery without a model call', () => {
  it('shows the Korean academic briefs and no document briefs', () => {
    const html = renderToStaticMarkup(
      createElement(AuthoringFlow, {
        lang: 'ko',
        busy: false,
        onGenerate: () => undefined,
        onClose: () => undefined,
      }),
    )
    for (const name of KO_NAMES) expect(html).toContain(name)
    expect(html).toContain('학술 발표 브리프')
    expect(html).not.toContain('견적서')
  })

  it('shows the English academic briefs when the UI language is English', () => {
    const html = renderToStaticMarkup(
      createElement(AuthoringFlow, {
        lang: 'en',
        busy: false,
        onGenerate: () => undefined,
        onClose: () => undefined,
      }),
    )
    for (const name of EN_NAMES) expect(html).toContain(name)
    expect(html).not.toContain('견적서')
  })
})
