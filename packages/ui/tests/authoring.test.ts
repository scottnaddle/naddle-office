import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AUTHORING_LANGS,
  authoringFlowReducer,
  authoringText,
  BriefCard,
  ClarifyCard,
  EditQueueCard,
  GenerationProgress,
  initialAuthoringState,
  TemplateGallery,
  type BriefModel,
} from '../src/index'

describe('authoring strings', () => {
  it('has every key in every supported language', () => {
    for (const lang of AUTHORING_LANGS) {
      expect(authoringText(lang, 'galleryOpen').trim().length, lang).toBeGreaterThan(0)
      expect(authoringText(lang, 'briefGenerate').trim().length, lang).toBeGreaterThan(0)
      expect(authoringText(lang, 'progressDone').trim().length, lang).toBeGreaterThan(0)
    }
    expect(authoringText('ko', 'galleryOpen')).toBe('템플릿으로 시작')
    expect(authoringText('en-US', 'galleryOpen')).toBe('Start from a template')
    expect(authoringText('unknown', 'galleryOpen')).toBe('Start from a template')
  })
})

describe('authoring flow', () => {
  it('moves template -> clarify -> brief -> generating -> done', () => {
    let state = authoringFlowReducer(initialAuthoringState(), { type: 'START' })
    expect(state.stage).toBe('template')
    state = authoringFlowReducer(state, { type: 'PICK_TEMPLATE', templateId: 'quote' })
    expect(state).toMatchObject({ stage: 'clarify', templateId: 'quote' })
    state = authoringFlowReducer(state, { type: 'ANSWER', answers: { customer: 'A' } })
    expect(state.answers.customer).toBe('A')
    const brief: BriefModel = { title: '견적서', sections: [{ id: 's', title: '개요' }] }
    state = authoringFlowReducer(state, { type: 'BRIEF_READY', brief })
    expect(state.stage).toBe('brief')
    state = authoringFlowReducer(state, { type: 'CONFIRM_BRIEF' })
    expect(state.stage).toBe('generating')
    state = authoringFlowReducer(state, { type: 'DONE' })
    expect(state).toMatchObject({ stage: 'done', outcome: 'done', percent: 100 })
  })

  it('keeps the brief when generation fails and resets on demand', () => {
    let state = authoringFlowReducer(initialAuthoringState(), { type: 'START' })
    state = authoringFlowReducer(state, {
      type: 'BRIEF_READY',
      brief: { title: 't', sections: [] },
    })
    state = authoringFlowReducer(state, { type: 'CONFIRM_BRIEF' })
    state = authoringFlowReducer(state, { type: 'FAIL', error: 'boom' })
    expect(state).toMatchObject({ outcome: 'failed', error: 'boom' })
    expect(state.brief?.title).toBe('t')
    state = authoringFlowReducer(state, { type: 'RESET' })
    expect(state).toEqual(initialAuthoringState())
  })
})

const brief: BriefModel = {
  title: '견적서',
  fields: [{ id: 'customer', label: '고객', value: 'A' }],
  directions: [{ id: 'base', name: '기본', description: '단정한 업무용' }],
  selectedDirectionId: 'base',
  sections: [
    { id: 'one', title: '견적 정보' },
    { id: 'two', title: '품목', locked: true },
  ],
  warnings: ['템플릿이 정한 순서는 고정입니다.'],
}

describe('authoring cards render without a model call', () => {
  it('renders the gallery and its templates', () => {
    const html = renderToStaticMarkup(
      createElement(TemplateGallery, {
        lang: 'ko',
        templates: [{ id: 'quote', name: '견적서', description: '견적 문서' }],
        onSelect: () => undefined,
      }),
    )
    expect(html).toContain('템플릿으로 시작')
    expect(html).toContain('견적서')
  })

  it('renders the first question with options', () => {
    const html = renderToStaticMarkup(
      createElement(ClarifyCard, {
        lang: 'ko',
        questions: [
          {
            id: 'customer',
            label: '받는 곳',
            options: [
              { id: 'a', label: 'A사' },
              { id: 'b', label: 'B사' },
            ],
          },
        ],
        onSubmit: () => undefined,
      }),
    )
    expect(html).toContain('받는 곳')
    expect(html).toContain('A사')
    expect(html).toContain('1 / 1')
  })

  it('renders the brief with fields, sections and warnings', () => {
    const html = renderToStaticMarkup(
      createElement(BriefCard, {
        lang: 'ko',
        model: brief,
        onChange: () => undefined,
        onConfirm: () => undefined,
      }),
    )
    expect(html).toContain('브리프 확인')
    expect(html).toContain('견적 정보')
    expect(html).toContain('템플릿이 정한 순서는 고정입니다.')
    expect(html).toContain('생성')
  })

  it('renders progress steps and a percentage', () => {
    const html = renderToStaticMarkup(
      createElement(GenerationProgress, {
        lang: 'ko',
        steps: [
          { key: 'write', label: '문서 작성', status: 'running' },
          { key: 'check', label: '검토', status: 'todo' },
        ],
        percent: 40,
      }),
    )
    expect(html).toContain('생성 중')
    expect(html).toContain('문서 작성')
    expect(html).toContain('40%')
  })

  it('renders the edit queue when it has items', () => {
    const html = renderToStaticMarkup(
      createElement(EditQueueCard, {
        lang: 'ko',
        items: [{ id: '1', targetLabel: '1문단', instruction: '고쳐 줘', status: 'pending' }],
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    )
    expect(html).toContain('대기 중인 수정')
    expect(html).toContain('1문단')
  })
})
