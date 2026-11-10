import { test, expect } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'
import { mkdtemp, writeFile, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A 0-byte office file (touch, aborted download) opens as a blank document
 * that still belongs to its path, so a plain Save writes the file itself
 * instead of failing the parse and silently saving elsewhere.
 */
/**
 * Playwright's ElectronApplication.evaluate can reject with "Resulting promise
 * was garbage collected" while the main process is still busy opening the
 * document. That is a transport error, not the app refusing the command, so
 * retry it before treating the save as broken.
 */
async function sendMenuCommand(app: ElectronApplication, url: string, channel: string) {
  const send = () =>
    app.evaluate(
      ({ webContents }, [u, ch]) => {
        webContents
          .getAllWebContents()
          .find((w) => w.getURL().includes(u))
          ?.send(ch, 'save')
      },
      [url, channel],
    )
  for (let attempt = 0; ; attempt += 1) {
    try {
      await send()
      return
    } catch (error) {
      const transport = /garbage collected|Target closed|Execution context was destroyed/i
      if (attempt >= 2 || !transport.test(String(error))) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

const KINDS = [
  { ext: 'docx', url: '://docs/', channel: 'menu:command' },
  { ext: 'xlsx', url: '://sheets/', channel: 'menu:action' },
  { ext: 'pptx', url: '://slides/', channel: 'slides:menu' },
]

for (const { ext, url, channel } of KINDS) {
  test(`empty .${ext} opens blank and saves back to its own path`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'genoffice-empty-'))
    const filePath = join(dir, `empty.${ext}`)
    await writeFile(filePath, '')
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: `open-empty-${ext}`,
      openFile: filePath,
    })
    const { app } = launched
    try {
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = (async () => {
          throw new Error('Save must not fall back to Save As')
        }) as typeof dialog.showSaveDialog
      })
      const editor = await waitForPageWithUrl(app, url)
      await editor.waitForTimeout(2000)
      await sendMenuCommand(app, url, channel)
      await expect
        .poll(async () => (await stat(filePath)).size, { timeout: 15_000 })
        .toBeGreaterThan(0)
      expect((await readFile(filePath)).subarray(0, 2).toString()).toBe('PK')
      // the tab still shows the file, not an untitled document
      const shellPage = await waitForPageWithUrl(app, 'shell/out')
      await expect(shellPage.locator('.tab-bar .tab-item:not(.tab-home)')).toContainText(
        `empty.${ext}`,
      )
    } finally {
      await closeAndSaveVideo(launched, `open-empty-${ext}`)
    }
  })
}
