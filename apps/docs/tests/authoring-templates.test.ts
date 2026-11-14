/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { BuiltinFormGalleryApi, BuiltinFormOpenInput } from '../src/shared/builtin-forms-api'
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
const s3Ids = [
  'draft',
  'purchase-request',
  'trip-request',
  'trip-report',
  'leave-request',
  'corp-card',
  'cooperation',
  'statement',
  'purchase-order',
  'official-letter',
]

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

function buttons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
}

function buttonWith(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return buttons(host).find((item) => item.textContent?.includes(text))
}

describe('document authoring templates', () => {
  it('keeps the five S1 forms first, in order', () => {
    expect(DOCUMENT_TEMPLATES.slice(0, 5).map((template) => template.name)).toEqual(names)
    expect(DOCUMENT_TEMPLATES.slice(0, 5).map((template) => template.id)).toEqual(ids)
  })

  it('adds the ten S3 office forms after them', () => {
    expect(DOCUMENT_TEMPLATES).toHaveLength(15)
    expect(DOCUMENT_TEMPLATES.slice(5).map((template) => template.name)).toEqual(s3Names)
  })

  it('keeps a shipped hwpx formAsset on the ten S3 forms only', () => {
    for (const id of s3Ids) {
      expect(documentTemplate(id)?.formAsset?.path, id).toBe(`assets/${id}.hwpx`)
    }
    for (const id of ids) expect(documentTemplate(id)?.formAsset, id).toBeUndefined()
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

describe('AuthoringFlow: builtin office forms', () => {
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean
  }
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

  afterEach(() => {
    delete window.aiOfficeBuiltinForms
  })

  async function render(bridge: BuiltinFormGalleryApi) {
    window.aiOfficeBuiltinForms = bridge
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(AuthoringFlow, {
          lang: 'en',
          busy: false,
          onGenerate: () => undefined,
          onClose: () => undefined,
        }),
      )
      await flush()
    })
    return { host, root }
  }

  it('opens the real hwpx copy instead of starting questions', async () => {
    const opened: BuiltinFormOpenInput[] = []
    const bridge: BuiltinFormGalleryApi = {
      open: async (input) => {
        opened.push(input)
        return { ok: true, tabId: 'tab-1' }
      },
    }
    const { host, root } = await render(bridge)

    await act(async () => {
      buttonWith(host, '기안서')!.click()
      await flush()
    })
    expect(host.querySelector('[data-testid="builtin-form-open"]')).toBeTruthy()
    expect(host.textContent).not.toContain('A few questions')

    await act(async () => {
      buttonWith(host, 'Open a copy')!.click()
      await flush()
    })
    expect(opened).toEqual([{ entryId: 'draft' }])
    expect(host.querySelector('[data-testid="builtin-form-open"]')).toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })

  it('shows an error and never falls back to the brief flow when the copy fails', async () => {
    const bridge: BuiltinFormGalleryApi = {
      open: async () => ({ ok: false, reason: 'missing-or-changed' }),
    }
    const { host, root } = await render(bridge)

    await act(async () => {
      buttonWith(host, '기안서')!.click()
      await flush()
    })
    await act(async () => {
      buttonWith(host, 'Open a copy')!.click()
      await flush()
    })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be opened')
    expect(host.textContent).not.toContain('A few questions')

    await act(async () => root.unmount())
    host.remove()
  })

  it('still sends the five S1 briefs to the clarify phase', async () => {
    const bridge: BuiltinFormGalleryApi = {
      open: async () => ({ ok: true }),
    }
    const { host, root } = await render(bridge)

    await act(async () => {
      buttonWith(host, '견적서')!.click()
      await flush()
    })
    expect(host.textContent).toContain('A few questions')
    expect(host.querySelector('[data-testid="builtin-form-open"]')).toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })
})
