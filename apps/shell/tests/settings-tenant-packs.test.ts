/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TenantPackActionResult,
  TenantPackPreviewView,
  TenantPackSummary,
  TenantPacksApi,
} from '../src/shared/tenant-packs-api'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'
import { TenantPacksPane } from '../src/renderer/src/tenant-packs/TenantPacksPane'

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
  delete (window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills
  delete (window as unknown as { aiOffice?: unknown }).aiOffice
})

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await flush()
  })
}

async function render(api: TenantPacksApi): Promise<void> {
  window.aiOfficeTenantPacks = api
  await act(async () => {
    root.render(
      createElement(LocaleProvider, { initial: 'en' }, createElement(TenantPacksPane, null)),
    )
    await flush()
  })
}

function button(label: string): HTMLButtonElement {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.trim() === label,
  )!
}

const preview: TenantPackPreviewView = {
  pack: { id: 'acme-pack', name: 'Acme forms', version: '1.0.0', publisher: 'Acme' },
  origin: { kind: 'zip', file: 'acme.zip' },
  license: 'proprietary-tenant',
  licenseNormalized: false,
  author: 'Acme',
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
      sha256Match: true,
      problems: [],
    },
  ],
  problems: [],
  requiresAttestation: true,
  replacesExisting: false,
}

const pack: TenantPackSummary = {
  id: 'acme-pack',
  name: 'Acme forms',
  version: '1.0.0',
  publisher: 'Acme',
  license: 'proprietary-tenant',
  author: 'Acme',
  origin: { kind: 'folder', folder: 'acme-pack' },
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

function api(overrides: Partial<TenantPacksApi> = {}): TenantPacksApi {
  return {
    importZip: vi.fn(),
    importFolder: vi.fn(),
    prepareZip: vi.fn(async () => ({
      ok: true,
      prepareToken: 'token-1',
      preview,
    })),
    prepareFolder: vi.fn(async () => ({ ok: true, canceled: true })),
    prepareGitHub: vi.fn(async () => ({ ok: true, prepareToken: 'token-gh', preview })),
    confirmInstall: vi.fn(async () => ({ ok: true, packs: [pack] })),
    cancelPrepare: vi.fn(async () => ({ ok: true })),
    list: vi.fn(async () => ({ ok: true, packs: [] })),
    remove: vi.fn(async () => ({ ok: true, packs: [] })),
    ...overrides,
  }
}

describe('Settings → Company forms', () => {
  it('shows a preview table, the replace/attestation notes, and a GitHub field', async () => {
    const bridge = api({
      prepareZip: vi.fn(async () => ({
        ok: true,
        prepareToken: 'token-1',
        preview: { ...preview, replacesExisting: true },
      })),
    })
    await render(bridge)
    expect(host.querySelector<HTMLInputElement>('input[placeholder*="owner/repo"]')).toBeTruthy()

    await click(button('Import zip…'))
    expect(bridge.prepareZip).toHaveBeenCalledTimes(1)
    const table = host.querySelector('[data-testid="tenant-packs-entry-table"]')
    expect(table?.textContent).toContain('Leave request form')
    expect(table?.textContent).toContain('form-skill')
    expect(table?.textContent).toContain('proprietary-tenant')
    expect(table?.textContent).toContain('matches')
    expect(host.textContent).toContain('already exists and will be replaced')
    expect(host.textContent).toContain('has the right to use these forms')
    expect(button('Import').disabled).toBe(true)
  })

  it('enables the install only after the rights checkbox, then installs the token', async () => {
    const bridge = api()
    await render(bridge)
    await click(button('Import zip…'))

    const attest = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(button('Import').disabled).toBe(true)
    await act(async () => {
      attest.click()
      await flush()
    })
    expect(button('Import').disabled).toBe(false)
    await click(button('Import'))
    expect(bridge.confirmInstall).toHaveBeenCalledWith('token-1', true)
    expect(host.textContent).toContain('Acme forms')
  })

  it('keeps install disabled when the preview has problems', async () => {
    const bridge = api({
      prepareZip: vi.fn(async () => ({
        ok: true,
        prepareToken: 'token-bad',
        preview: { ...preview, problems: ['sha256 does not match'] },
      })),
    })
    await render(bridge)
    await click(button('Import zip…'))
    expect(host.textContent).toContain('sha256 does not match')
    const attest = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(attest.disabled).toBe(true)
    expect(button('Import').disabled).toBe(true)
    await act(async () => {
      attest.click()
      await flush()
    })
    expect(button('Import').disabled).toBe(true)
  })

  it('prepares a GitHub address from the text field', async () => {
    const bridge = api()
    await render(bridge)
    const input = host.querySelector<HTMLInputElement>('input[placeholder*="owner/repo"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'owner/repo')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
    })
    await click(button('Import from GitHub'))
    expect(bridge.prepareGitHub).toHaveBeenCalledWith('owner/repo')
  })

  it('lists the current tenant packs and removes one after a confirmation', async () => {
    const bridge = api({
      list: vi.fn(async () => ({ ok: true, packs: [pack] })),
    })
    await render(bridge)
    expect(host.textContent).toContain('Acme forms (acme-pack)')
    expect(host.textContent).toContain('forms verified')

    await click(button('Remove…'))
    expect(host.textContent).toContain('Remove Acme forms?')
    expect(bridge.remove).not.toHaveBeenCalled()
    await click(button('Remove'))
    expect(bridge.remove).toHaveBeenCalledWith('acme-pack')
  })

  it('shows a tampered pack with its problems', async () => {
    const bridge = api({
      list: vi.fn(async () => ({
        ok: true,
        packs: [{ ...pack, verified: false, problems: ['leave-form: the form is missing'] }],
      })),
    })
    await render(bridge)
    expect(host.textContent).toContain('forms changed or missing')
    expect(host.textContent).toContain('leave-form: the form is missing')
  })

  it('shows the prepare error from main', async () => {
    const bridge = api({
      prepareZip: vi.fn(async (): Promise<TenantPackActionResult> => ({
        ok: false,
        reason: 'unsafe',
        error: 'zip contained a path escape',
      })),
    })
    await render(bridge)
    await click(button('Import zip…'))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('path escape')
    expect(button('Import')).toBeUndefined()
  })

  it('keeps the company forms panel under Skills without a separate navigation entry', async () => {
    window.aiOffice = {
      getTheme: async () => 'system',
      getDefaultSaveDir: async () => '',
      getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
      getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
      getUpdateChannel: async () => 'stable',
      getAppVersion: async () => '1.0.0',
      openHelp: vi.fn(async () => {}),
    } as unknown as HomeApi
    ;(window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills = {
      list: vi.fn(async () => []),
      onChanged: vi.fn(() => () => undefined),
    }
    const bridge = api({ list: vi.fn(async () => ({ ok: true, packs: [pack] })) })
    window.aiOfficeTenantPacks = bridge

    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(SettingsModal, { onClose: vi.fn(), target: { section: 'skills' } }),
        ),
      )
      await Promise.resolve()
    })
    await flush()

    const labels = [...host.querySelectorAll('.set-nav-item')].map((item) =>
      item.textContent?.trim(),
    )
    expect(labels).toEqual(['Account', 'AI', 'Skills', 'General', 'Integrations', 'About'])
    expect(labels).not.toContain('Company forms')

    const panel = host.querySelector('[data-testid="tenant-packs-pane"]')
    expect(panel).toBeTruthy()
    const heading = [...panel!.querySelectorAll('h3')].find(
      (node) => node.textContent?.trim() === 'Company forms',
    )
    expect(heading).toBeTruthy()
    expect(host.textContent).toContain('Acme forms (acme-pack)')
  })
})
