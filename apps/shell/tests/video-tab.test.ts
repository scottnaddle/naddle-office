import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeWebContents {
  id: number
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  listeners: Map<string, () => void>
}

interface FakeView {
  webContents: FakeWebContents
  setVisible: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
}

let nextWebContentsId = 1

function makeFakeView(): FakeView {
  const listeners = new Map<string, () => void>()
  return {
    webContents: {
      id: nextWebContentsId++,
      listeners,
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler)
      }),
      once: vi.fn(),
      close: vi.fn(),
      reload: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
    setVisible: vi.fn(),
    setBounds: vi.fn(),
  }
}

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {
    webContents = {
      id: 900001,
      setWindowOpenHandler: () => ({ action: 'deny' as const }),
      loadURL: () => Promise.resolve(),
      focus: () => {},
      on: () => {},
      once: () => {},
      close: () => {},
      reload: () => {},
      isDestroyed: () => false,
    }
    setBounds = () => {}
    setVisible = () => {}
  },
}))

const createVideoView = vi.fn(() => makeFakeView())

vi.mock('@naddle/video/main', () => ({
  createVideoView: (...args: unknown[]) => createVideoView(...(args as [])),
  videoIsDirty: () => false,
}))

vi.mock('../../docs/src/main/docs-main', () => ({
  createDocsView: () => makeFakeView(),
  docsQueryDirty: () => Promise.resolve(false),
  markDocsNewBlank: () => {},
  queueDocsAiContent: () => {},
  queueDocsCopy: () => {},
  requestDocsClose: () => Promise.resolve(true),
  setActiveDocsResolver: () => {},
  teardownDocsRenderer: () => {},
}))
vi.mock('../../markdown/src/main/markdown-main', () => ({
  createMarkdownView: () => makeFakeView(),
  markdownIsDirty: () => false,
  requestMarkdownClose: () => Promise.resolve(true),
}))
vi.mock('../../html/src/main/html-main', () => ({
  createHtmlPresentView: () => makeFakeView(),
  createHtmlView: () => makeFakeView(),
  htmlIsDirty: () => false,
  requestHtmlClose: () => Promise.resolve(true),
}))
vi.mock('../../html/src/main/seed-main', () => ({ queueHtmlSeedFor: () => {} }))
vi.mock('../../markdown/src/main/seed-main', () => ({ queueMarkdownSeedFor: () => {} }))
vi.mock('../../mindmap/src/main/seed-main', () => ({ queueMindmapSeedFor: () => {} }))
vi.mock('../../slides/src/main/seed-queue', () => ({ queueSlidesSeedFor: () => {} }))
vi.mock('../../hwp/src/main/hwp-main', () => ({
  createHwpView: () => makeFakeView(),
  hwpIsDirty: () => false,
  hwpMemoModalOpen: () => false,
  requestHwpClose: () => Promise.resolve(true),
}))
vi.mock('../../mindmap/src/main/mindmap-main', () => ({
  createMindmapView: () => makeFakeView(),
  mindmapIsDirty: () => false,
  requestMindmapClose: () => Promise.resolve(true),
}))
vi.mock('../../epub/src/main/epub-main', () => ({
  createEpubView: () => makeFakeView(),
  epubIsDirty: () => false,
  requestEpubClose: () => Promise.resolve(true),
}))
vi.mock('../../diagram/src/main/diagram-main', () => ({
  createDiagramView: () => makeFakeView(),
  diagramIsDirty: () => false,
  diagramTabIdentity: () => null,
  requestDiagramClose: () => Promise.resolve(true),
}))
vi.mock('../../pdf/src/main/pdf-main', () => ({
  createPdfView: () => makeFakeView(),
  clearPdfDirty: () => {},
  markPdfUntitledCopy: () => {},
  pdfIsDirty: () => false,
  requestPdfClose: () => Promise.resolve(true),
}))
vi.mock('../../sheets/src/main/sheets-main', () => ({
  createSheetsView: () => makeFakeView(),
  nudgeQueuedWorkbook: () => {},
  queueWorkbookForView: () => {},
  requestSheetsClose: () => Promise.resolve(true),
  setActiveSheetsWebContents: () => {},
  setSheetsNewBlank: () => {},
  sheetsPendingEditCount: () => 0,
}))
vi.mock('../../slides/src/main/slides-main', () => ({
  createSlidesView: () => makeFakeView(),
  requestSlidesClose: () => Promise.resolve(true),
  setActiveSlidesWebContents: () => {},
  slidesIsDirty: () => false,
}))
vi.mock('@genoffice/electron-utils', () => ({
  rendererUrl: () => 'genoffice-app://video/index.html',
  safeExternalUrl: () => null,
}))
vi.mock('../src/main/renderer-disposal', () => ({ releaseClosedRenderer: () => true }))
vi.mock('../src/main/generate/handoff', () => ({
  dropGenerateHandoff: () => {},
  queueGenerateHandoffFor: () => {},
}))
vi.mock('../src/main/generate/converted-tab', () => ({ queueConvertedContent: () => {} }))

import { TabManager } from '../src/main/tab-manager'

const WINDOW_WIDTH = 800
const WINDOW_HEIGHT = 600

function makeShellWindow() {
  return {
    on: vi.fn(),
    webContents: { once: vi.fn(), focus: vi.fn() },
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    getContentBounds: () => ({ x: 0, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  }
}

let shellWindow: ReturnType<typeof makeShellWindow>
let manager: TabManager

beforeEach(() => {
  vi.clearAllMocks()
  nextWebContentsId = 1
  shellWindow = makeShellWindow()
  manager = new TabManager(
    shellWindow as never,
    () => {},
    () => {},
  )
})

describe('video tab', () => {
  it('opens a closable, active, untitled video tab with no file', () => {
    const id = manager.openVideoTab()
    expect(createVideoView).toHaveBeenCalledTimes(1)
    const tab = manager.list().find((candidate) => candidate.id === id)
    expect(tab).toMatchObject({ kind: 'video', title: 'Video', closable: true, active: true })
    expect(tab?.filePath).toBeUndefined()
    expect(shellWindow.contentView.addChildView).toHaveBeenCalledTimes(1)
  })

  it('reports the video tab as clean to the open-documents list', async () => {
    const id = manager.openVideoTab()
    const documents = await manager.openDocuments()
    expect(documents).toEqual([
      {
        id,
        kind: 'video',
        title: 'Video',
        active: true,
        dirty: false,
      },
    ])
  })

  it('closes like any clean tab, without a dirty prompt', async () => {
    const id = manager.openVideoTab()
    const view = createVideoView.mock.results.at(-1)!.value as FakeView
    await manager.closeTab(id)
    expect(shellWindow.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(view.webContents.close).toHaveBeenCalledTimes(1)
    expect(manager.list()).toHaveLength(1)
  })
})
