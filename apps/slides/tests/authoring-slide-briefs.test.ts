import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { academicSlideGuide, businessSlideGuide } from '@genoffice/ui'
import { AuthoringFlow } from '../src/renderer/ai/AuthoringFlow'
import {
  SLIDE_BRIEFS,
  buildSlideBrief,
  buildSlideBriefPrompt,
  slideBrief,
  slideBriefsFor,
} from '../src/renderer/ai/authoring/templates'

const ACADEMIC_IDS = ['academic-conference', 'academic-seminar', 'thesis-defense', 'grant-briefing']
const ACADEMIC_KO_NAMES = ['학회 발표', '세미나 발표', '학위논문 심사', '연구비 브리핑']
const ACADEMIC_EN_NAMES = [
  'Conference presentation',
  'Seminar presentation',
  'Thesis defense',
  'Grant briefing',
]
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
const ALL_IDS = [...ACADEMIC_IDS, ...BUSINESS_IDS]
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

describe('academic slide briefs', () => {
  it('lists the academic four first with Korean defaults and English copy', () => {
    expect(SLIDE_BRIEFS.slice(0, 4).map((template) => template.id)).toEqual(ACADEMIC_IDS)
    expect(SLIDE_BRIEFS.slice(0, 4).map((template) => template.name)).toEqual(ACADEMIC_KO_NAMES)
    const english = slideBriefsFor('en-US').slice(0, 4)
    expect(english.map((template) => template.id)).toEqual(ACADEMIC_IDS)
    expect(english.map((template) => template.name)).toEqual(ACADEMIC_EN_NAMES)
    for (const template of SLIDE_BRIEFS.slice(0, 4)) {
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

  it('writes a Korean prompt with answers, section order and the Korean academic guide', () => {
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
    expect(prompt).toContain('학술 발표 슬라이드 작성 지침')
    expect(prompt).not.toContain('Academic slide brief guidance')
    expect(prompt).not.toContain('기업 보고 슬라이드 작성 지침')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })

  it('writes an English prompt with the English academic guide', () => {
    const template = slideBrief('academic-conference', 'en')!
    const answers = { length: '10', claim: 'State the claim first.' }
    const brief = buildSlideBrief(template, answers)
    const prompt = buildSlideBriefPrompt(template, answers, brief, 'en')
    expect(prompt).toContain('Conference presentation')
    expect(prompt).toContain('State the claim first.')
    expect(prompt).toContain('1. Title')
    expect(prompt).toContain('slide deck for a talk, not a document')
    expect(prompt).toContain(academicSlideGuide('en'))
    expect(prompt).toContain('Academic slide brief guidance')
    expect(prompt).not.toContain('학술 발표 슬라이드 작성 지침')
    expect(prompt).not.toContain('Business slide brief guidance')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })
})

describe('business slide briefs', () => {
  it('lists all eight briefs, academic four then business four', () => {
    expect(SLIDE_BRIEFS.map((template) => template.id)).toEqual(ALL_IDS)
    expect(SLIDE_BRIEFS.map((template) => template.name)).toEqual([
      ...ACADEMIC_KO_NAMES,
      ...BUSINESS_KO_NAMES,
    ])
    const english = slideBriefsFor('en-US')
    expect(english.map((template) => template.id)).toEqual(ALL_IDS)
    expect(english.map((template) => template.name)).toEqual([
      ...ACADEMIC_EN_NAMES,
      ...BUSINESS_EN_NAMES,
    ])
    for (const template of SLIDE_BRIEFS.slice(4)) {
      expect(template.questions.length, template.id).toBeGreaterThan(0)
      expect(template.sections.length, template.id).toBeGreaterThan(0)
    }
  })

  it('builds the four business briefs locally with their fixed sections', () => {
    const spine = (id: string) =>
      buildSlideBrief(slideBrief(id, 'ko')!, {}).sections.map((section) => section.id)
    expect(spine('executive-briefing')).toEqual(EXEC_SPINE)
    expect(spine('board-report')).toEqual(BOARD_SPINE)
    expect(spine('client-proposal')).toEqual(CLIENT_SPINE)
    expect(spine('project-retrospective')).toEqual(RETRO_SPINE)
  })

  it('writes a Korean business prompt with only the Korean business guide', () => {
    const template = slideBrief('executive-briefing', 'ko')!
    const answers = {
      audience: '대표이사와 임원진',
      decision: '신규 사업 예산 집행 승인',
      length: '10',
    }
    const brief = buildSlideBrief(template, answers)
    const prompt = buildSlideBriefPrompt(template, answers, brief, 'ko')
    expect(prompt).toContain('경영진 보고')
    expect(prompt).toContain('신규 사업 예산 집행 승인')
    expect(prompt).toContain('1. 제목')
    expect(prompt).toContain('9. 부록')
    expect(prompt).toContain(businessSlideGuide('ko'))
    expect(prompt).toContain('기업 보고 슬라이드 작성 지침')
    expect(prompt).not.toContain('Academic slide brief guidance')
    expect(prompt).not.toContain('학술 발표 슬라이드 작성 지침')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })

  it('writes an English business prompt with only the English business guide', () => {
    const template = slideBrief('client-proposal', 'en')!
    const answers = {
      client: 'A logistics company',
      problem: 'Order delays are increasing churn.',
      offer: 'Order-management automation plus support',
    }
    const brief = buildSlideBrief(template, answers)
    const prompt = buildSlideBriefPrompt(template, answers, brief, 'en')
    expect(prompt).toContain('Client proposal')
    expect(prompt).toContain('Order delays are increasing churn.')
    expect(prompt).toContain('1. Title')
    expect(prompt).toContain('9. Appendix')
    expect(prompt).toContain(businessSlideGuide('en'))
    expect(prompt).toContain('Business slide brief guidance')
    expect(prompt).not.toContain('학술 발표 슬라이드 작성 지침')
    expect(prompt).not.toContain('Academic slide brief guidance')
    expect(prompt.toLowerCase()).not.toContain('pptxgenjs')
    expect(prompt).not.toContain('Proprietary')
    expect(prompt).not.toContain(UPSTREAM_PDF)
  })
})

describe('slides authoring gallery without a model call', () => {
  it('shows both categories and every Korean brief with no document briefs', () => {
    const html = renderToStaticMarkup(
      createElement(AuthoringFlow, {
        lang: 'ko',
        busy: false,
        onGenerate: () => undefined,
        onClose: () => undefined,
      }),
    )
    for (const name of [...ACADEMIC_KO_NAMES, ...BUSINESS_KO_NAMES]) expect(html).toContain(name)
    expect(html).toContain('슬라이드 브리프')
    expect(html).toContain('학술 발표')
    expect(html).toContain('기업 보고')
    expect(html).not.toContain('견적서')
  })

  it('shows both categories and every English brief when the UI language is English', () => {
    const html = renderToStaticMarkup(
      createElement(AuthoringFlow, {
        lang: 'en',
        busy: false,
        onGenerate: () => undefined,
        onClose: () => undefined,
      }),
    )
    for (const name of [...ACADEMIC_EN_NAMES, ...BUSINESS_EN_NAMES]) expect(html).toContain(name)
    expect(html).toContain('Slide briefs')
    expect(html).toContain('Academic presentations')
    expect(html).toContain('Business reports')
    expect(html).not.toContain('견적서')
  })
})
