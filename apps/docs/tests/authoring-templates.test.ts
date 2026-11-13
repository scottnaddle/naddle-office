import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthoringFlow } from '../src/renderer/ai/AuthoringFlow'
import {
  DOCUMENT_TEMPLATES,
  buildDocumentBrief,
  buildDocumentPrompt,
  documentTemplate,
} from '../src/renderer/ai/authoring/templates'

const names = ['견적서', '품의서', '지출결의서', '회의록', '업무 보고']
const ids = ['quote', 'approval', 'expense', 'minutes', 'report']
/** The ten S3 office forms, each shipped with a self-authored .hwpx. */
const s3Names = [
  '기안서',
  '구매품의서',
  '출장신청서',
  '출장보고서',
  '휴가신청서',
  '법인카드 사용내역서',
  '업무협조전',
  '거래명세서',
  '발주서',
  '공문(시행문)',
]

describe('document authoring templates', () => {
  it('keeps the five S1 forms first, in order', () => {
    expect(DOCUMENT_TEMPLATES.slice(0, 5).map((template) => template.name)).toEqual(names)
    expect(DOCUMENT_TEMPLATES.slice(0, 5).map((template) => template.id)).toEqual(ids)
  })

  it('adds the ten S3 office forms after them', () => {
    expect(DOCUMENT_TEMPLATES).toHaveLength(15)
    expect(DOCUMENT_TEMPLATES.slice(5).map((template) => template.name)).toEqual(s3Names)
  })

  it('every template asks questions and has an ordered section list', () => {
    for (const template of DOCUMENT_TEMPLATES) {
      expect(template.questions.length, template.id).toBeGreaterThanOrEqual(3)
      expect(template.sections.length, template.id).toBeGreaterThanOrEqual(3)
      expect(
        template.questions.some((question) => question.required),
        template.id,
      ).toBe(true)
    }
  })

  it('builds a brief from answers without calling a model', () => {
    const template = documentTemplate('quote')
    expect(template).toBeTruthy()
    const brief = buildDocumentBrief(template!, {
      customer: 'A 주식회사',
      items: '노트북 10대',
      tax: 'included',
    })
    expect(brief.title).toBe('견적서')
    expect(brief.fields?.map((field) => field.value)).toContain('A 주식회사')
    expect(brief.sections.map((section) => section.title)).toEqual([
      '견적 정보',
      '품목 및 금액',
      '합계 및 조건',
      '유효기간 및 서명',
    ])
    expect(brief.warnings?.[0]).toContain('고정')
  })

  it('builds an instruction that carries the answers and the fixed section order', () => {
    const template = documentTemplate('minutes')!
    const answers = { meeting: '주간 회의', agenda: '출시 일정', attendees: 'A, B' }
    const prompt = buildDocumentPrompt(template, answers, buildDocumentBrief(template, answers))
    expect(prompt).toContain('회의록')
    expect(prompt).toContain('주간 회의')
    expect(prompt).toContain('출시 일정')
    expect(prompt).toContain('1. 회의 정보')
    expect(prompt).toContain('4. 후속 조치')
    expect(prompt).toContain('확인되지 않은 사실이나 금액을 새로 만들지 마세요')
  })
})

describe('AuthoringFlow without a model call', () => {
  it('starts on the template gallery', () => {
    const html = renderToStaticMarkup(
      createElement(AuthoringFlow, {
        lang: 'ko',
        busy: false,
        onGenerate: () => undefined,
        onClose: () => undefined,
      }),
    )
    for (const name of [...names, ...s3Names]) expect(html).toContain(name)
    expect(html).toContain('템플릿으로 시작')
  })
})
