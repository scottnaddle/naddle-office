import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { HOME_KINDS } from '../src/shared/home-kinds'

/**
 * V3 hosts a placeholder video tab. The main entry (src/main/index.ts) cannot
 * be imported in a node test, so its lists, locale table and wiring are read
 * out of the source, as diagram-shell-wiring.test.ts does. Only the facts this
 * slice introduces are checked; V4's authoring flow and V6's Home/help/session
 * wiring are deliberately absent.
 */
const main = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
const tabsApi = readFileSync(join(__dirname, '../src/shared/tabs-api.ts'), 'utf8')
const tools = readFileSync(join(__dirname, '../src/main/mcp/tools/open-documents-tools.ts'), 'utf8')
const builder = readFileSync(join(__dirname, '../electron-builder.cjs'), 'utf8')
const ledger = JSON.parse(
  readFileSync(join(__dirname, '../../../docs/upstream-hooks.json'), 'utf8'),
) as { cap: number; warnAt: number }

/** the declaration `const NAME …` up to the blank line that ends it */
function literal(source: string, name: string): string {
  const start = source.indexOf(`const ${name}`)
  if (start < 0) throw new Error(`no ${name}`)
  const end = source.indexOf('\n\n', start)
  return source.slice(start, end < 0 ? undefined : end)
}

/** a function's source, from `function NAME(` to the next top-level function */
function fnSource(name: string): string {
  const start = main.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`no ${name}`)
  const end = main.indexOf('\nfunction ', start + 1)
  return main.slice(start, end < 0 ? undefined : end)
}

/** one locale's slice of the main-process table */
function localeBlock(locale: string): string {
  const head = locale.includes('-') ? `'${locale}'` : locale
  const start = main.indexOf(`\n  ${head}: {\n`)
  if (start < 0) throw new Error(`no ${locale} block`)
  const rest = main.slice(start + 1)
  const end = rest.search(/\n {2}\S+: \{/)
  return end < 0 ? rest : rest.slice(0, end)
}

const valueIn = (block: string, key: string) =>
  block.match(new RegExp(`\\n {4}${key}: '([^']*)'`))?.[1]

describe('the video tab kind', () => {
  it('is part of TabKind', () => {
    const kind = tabsApi.slice(
      tabsApi.indexOf('export type TabKind'),
      tabsApi.indexOf('export type DocumentTabKind'),
    )
    expect(kind).toMatch(/\|\s*'video'/)
  })

  it('maps to the html family for the MCP list, but stays unreadable', () => {
    expect(tools).toContain("video: 'html',")
    const readable = tools.slice(
      tools.indexOf('const READABLE_KINDS'),
      tools.indexOf('export interface OpenDocumentsControl'),
    )
    expect(readable).not.toContain("'video'")
  })

  it('has a tab-strip menu icon that reuses an existing asset', () => {
    expect(literal(main, 'TAB_MENU_ICON')).toContain("video: 'html',")
  })
})

describe('the new-video menu entry', () => {
  it('opens a new video tab without becoming a Home kind', () => {
    expect(fnSource('newVideoTab')).toContain("bindPendingDir('video', tabManager?.openVideoTab())")
    expect(literal(main, 'NEW_KIND_MENU')).not.toContain('video:')
    expect(HOME_KINDS).not.toContain('video')
  })

  it('is appended to the File and "+" menus only when no explicit list is given', () => {
    const menu = fnSource('newDocumentMenuItems')
    expect(menu).toContain('if (!opts.only) {')
    expect(menu).toContain("label: tm('menuNewVideo'),")
    expect(menu).toContain('newVideoTab()')
    // the macOS dock passes only:[…], so it never gets the video item
    expect(main).toContain(
      "...newDocumentMenuItems({ only: ['docx', 'xlsx', 'pptx', 'md', 'pdf'] })",
    )
  })
})

describe('the video tab menu and title', () => {
  it('routes a video tab to the home menu so File → New lists the video item', () => {
    expect(fnSource('applyMenuFor')).toMatch(/case 'video':\s*buildHomeMenu\(\)/)
  })

  it('names the untitled tab from the locale table', () => {
    const title = main.slice(
      main.indexOf('(kind) =>'),
      main.indexOf('// the tab strip is interface chrome'),
    )
    expect(title).toContain("kind === 'video'")
    expect(title).toContain("tm('untitledVideo')")
  })

  it('has both keys in every language, with the Korean wording', () => {
    expect(LANGS).toHaveLength(21)
    expect(valueIn(localeBlock('ko'), 'menuNewVideo')).toBe('영상')
    expect(valueIn(localeBlock('ko'), 'untitledVideo')).toBe('제목 없는 영상')
    expect(valueIn(localeBlock('en'), 'menuNewVideo')).toBe('Video')
    expect(valueIn(localeBlock('en'), 'untitledVideo')).toBe('Untitled Video')
    for (const lang of LANGS) {
      const block = localeBlock(lang)
      expect(valueIn(block, 'menuNewVideo'), `${lang} menuNewVideo`).toBeTruthy()
      expect(valueIn(block, 'untitledVideo'), `${lang} untitledVideo`).toBeTruthy()
    }
  })
})

describe('the video renderer runtime', () => {
  it('registers the video schemes in the single privileged-scheme call', () => {
    expect(main.match(/registerPrivilegedSchemes\(\[/g)).toHaveLength(1)
    const at = main.indexOf('registerPrivilegedSchemes([')
    const call = main.slice(at, main.indexOf('])', at) + 2)
    expect(call).toContain('EPUB_ASSET_SCHEME_PRIVILEGE')
    expect(call).toContain('DRAWIO_SCHEME_PRIVILEGE')
    expect(call).toContain('...VIDEO_SCHEME_PRIVILEGES')
  })

  it('configures the runtime and serves the placeholder through the renderer scheme', () => {
    expect(main).toContain('configureVideoRuntime({')
    expect(main).toContain('rendererUrl: process.env.VIDEO_RENDERER_URL')
    expect(literal(main, 'VIDEO_OUT')).toContain("join(process.resourcesPath, 'modules', 'video')")
    expect(main).toContain("video: join(VIDEO_OUT, 'renderer'),")
  })

  it('ships the placeholder as an extra resource and requires it before packaging', () => {
    expect(builder).toContain("from: '../../packages/naddle-video/out'")
    expect(builder).toContain("to: 'modules/video'")
    expect(builder).toContain("'../../packages/naddle-video/out/renderer/index.html'")
  })
})

describe('the upstream hook cap', () => {
  it('is raised to 95 with the same five-count warning margin', () => {
    expect(ledger.cap).toBe(95)
    expect(ledger.warnAt).toBe(90)
  })
})
