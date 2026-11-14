/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TenantPackActionResult,
  TenantPackGalleryApi,
  TenantPackSummary,
} from '../src/shared/tenant-packs-api'
import { AuthoringFlow } from '../src/renderer/ai/AuthoringFlow'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.aiOfficeTenantPacks
})

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

async function render(api: TenantPackGalleryApi | undefined, onGenerate = vi.fn()): Promise<void> {
  if (api) window.aiOfficeTenantPacks = api
  await act(async () => {
    root.render(
      createElement(AuthoringFlow, {
        lang: 'en',
        busy: false,
        onGenerate,
        onClose: () => undefined,
      }),
    )
    await flush()
  })
}

function buttons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
}

function buttonWith(text: string): HTMLButtonElement | undefined {
  return buttons().find((item) => item.textContent?.includes(text))
}

const pack: TenantPackSummary = {
  id: 'acme-pack',
  name: 'Acme forms',
  version: '1.0.0',
  publisher: 'Acme',
  license: 'proprietary-tenant',
  author: 'Acme',
  origin: { kind: 'zip', file: 'acme.zip' },
  installedAt: '2026-01-01T00:00:00.000Z',
  formCount: 1,
  verified: true,
  problems: [],
  entries: [
    {
      id: 'leave-form',
      kind: 'form-skill',
      name: 'Leave request form',
      license: 'proprietary-tenant',
      author: 'Acme',
      skillPath: 'forms/leave',
      formAsset: 'assets/leave.hwpx',
      sha256: 'a'.repeat(64),
    },
  ],
}

function gallery(overrides: Partial<TenantPackGalleryApi> = {}): TenantPackGalleryApi {
  return {
    list: vi.fn(async (): Promise<TenantPackActionResult> => ({ ok: true, packs: [pack] })),
    openForm: vi.fn(async () => ({ ok: true, tabId: 'tab-1' })),
    ...overrides,
  }
}

describe('Authoring gallery: company forms', () => {
  it('keeps the builtin templates above the company group', async () => {
    await render(gallery())
    expect(host.textContent).toContain('Start from a template')
    expect(host.textContent).toContain('견적서')
    expect(host.textContent).toContain('회의록')
    expect(host.textContent).toContain('Company forms')
    expect(host.textContent).toContain('Leave request form')
    expect(host.textContent).toContain('License: proprietary-tenant')
  })

  it('shows the company heading and a muted empty state', async () => {
    await render(gallery({ list: vi.fn(async () => ({ ok: true, packs: [] })) }))
    expect(host.textContent).toContain('Company forms')
    expect(host.textContent).toContain('No company forms are stored for this tenant yet.')
  })

  it('shows a tampered pack card disabled with the reason', async () => {
    await render(
      gallery({
        list: vi.fn(async () => ({
          ok: true,
          packs: [{ ...pack, verified: false, problems: ['the form is missing'] }],
        })),
      }),
    )
    const card = buttonWith('Leave request form')!
    expect(card.disabled).toBe(true)
    expect(card.textContent).toContain('the form is missing')
  })

  it('opens a verified form with packId and entryId, never a path or onGenerate', async () => {
    const onGenerate = vi.fn()
    const bridge = gallery()
    await render(bridge, onGenerate)

    await act(async () => {
      buttonWith('Leave request form')!.click()
      await flush()
    })
    expect(host.querySelector('[data-testid="company-form-open"]')).toBeTruthy()

    await act(async () => {
      buttonWith('Open a copy')!.click()
      await flush()
    })
    expect(bridge.openForm).toHaveBeenCalledWith({
      packId: 'acme-pack',
      entryId: 'leave-form',
    })
    const sent = vi.mocked(bridge.openForm).mock.calls[0]![0]
    expect(JSON.stringify(sent)).not.toContain('/')
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('sends the optional fill instruction and keeps onGenerate out of a failed open', async () => {
    const onGenerate = vi.fn()
    const bridge = gallery({
      openForm: vi.fn(async () => ({
        ok: false,
        error: 'The form is missing or its hash does not match.',
      })),
    })
    await render(bridge, onGenerate)
    await act(async () => {
      buttonWith('Leave request form')!.click()
      await flush()
    })
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Fill today’s date')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
    })
    await act(async () => {
      buttonWith('Open a copy')!.click()
      await flush()
    })
    expect(bridge.openForm).toHaveBeenCalledWith({
      packId: 'acme-pack',
      entryId: 'leave-form',
      text: 'Fill today’s date',
    })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('hash does not match')
    expect(onGenerate).not.toHaveBeenCalled()
  })
})
