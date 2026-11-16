/**
 * The shell's video tab view. V3 only hosts a static placeholder page: no IPC,
 * no authoring flow and no render controls are wired yet. The view stays
 * sandboxed and isolated exactly like the other document tabs.
 */
import { WebContentsView } from 'electron'
import { rendererUrl } from '@genoffice/electron-utils/renderer-scheme'

export interface VideoRuntime {
  /** optional preload; the placeholder needs none */
  preloadPath?: string
  /** the renderer's dev server, when one runs */
  rendererUrl?: string
  /** the built renderer page (`<module out>/renderer/index.html`) */
  rendererFile?: string
}

let runtime: VideoRuntime = {}

export function configureVideoRuntime(paths: VideoRuntime): void {
  runtime = paths
}

/** A video tab for the shell. Call after app ready. */
export function createVideoView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      ...(runtime.preloadPath ? { preload: runtime.preloadPath } : {}),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void view.webContents.loadURL(rendererUrl(runtime.rendererUrl, 'video'))
  return view
}

/** Video tabs have no document to save in V3, so they are never dirty. */
export function videoIsDirty(): boolean {
  return false
}
