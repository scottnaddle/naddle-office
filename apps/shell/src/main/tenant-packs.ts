/**
 * The tenant template pack entry points in main: native dialogs from the app
 * menu and the narrow IPC bridge. Import writes only under the current
 * tenant's `template-packs` folder; no tenant value comes from a renderer.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { Lang } from '@genoffice/i18n'
import {
  TenantPackError,
  disposeTenantPack,
  installPreparedTenantPack,
  listTenantPacks,
  prepareTenantPackFolder,
  prepareTenantPackZip,
  removeTenantPack,
  tenantPackMessage,
  tenantPackStoreDir,
  type TenantPackListItem,
  type TenantPackPrepared,
  type TenantPackPreview,
} from '@naddle/template-packs'
import {
  TENANT_PACKS_CHANNELS as C,
  type TenantPackActionResult,
  type TenantPackOriginView,
} from '../shared/tenant-packs-api'
import { tenantPacksText } from './tenant-packs-strings'

export interface TenantPacksIpcDeps {
  userDataDir: () => string
  /** from the main-process tenant snapshot only; no renderer value is read */
  tenantId: string | undefined
  lang: () => Lang
  parentWindow: () => BrowserWindow | null
  isMainWindow: (sender: WebContents) => boolean
}

let current: TenantPacksIpcDeps | null = null

function storeDir(deps: TenantPacksIpcDeps): string {
  return tenantPackStoreDir(deps.userDataDir(), deps.tenantId)
}

function actionFailure(error: unknown): TenantPackActionResult {
  const reason = error instanceof TenantPackError ? error.code : 'failed'
  return { ok: false, reason, error: tenantPackMessage(error) }
}

function originText(origin: TenantPackOriginView): string {
  switch (origin.kind) {
    case 'zip':
      return `zip: ${origin.file}`
    case 'folder':
      return `folder: ${origin.folder}`
    case 'github':
      return `GitHub: ${origin.repo}@${origin.commit}${origin.path ? `/${origin.path}` : ''}`
  }
}

function packLines(pack: TenantPackListItem, lang: Lang): string[] {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  return [
    `${pack.name} (${pack.id}) ${pack.version}`,
    `  ${t('licenseLabel')}: ${pack.license}`,
    `  ${t('authorLabel')}: ${pack.author}`,
    `  ${t('originLabel')}: ${originText(pack.origin)}`,
    `  ${pack.formCount} ${t('formsLabel')} · ${pack.verified ? t('verifiedLabel') : t('tamperedLabel')}`,
    ...pack.problems.map((problem) => `  ! ${problem}`),
  ]
}

function previewDetail(preview: TenantPackPreview, lang: Lang): string {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  const lines: string[] = [
    `${preview.pack.name} (${preview.pack.id}) ${preview.pack.version}`,
    `${t('licenseLabel')}: ${preview.license}${preview.licenseNormalized ? ' (CC0 -> CC0-1.0)' : ''}`,
    `${t('authorLabel')}: ${preview.author || t('noneLabel')}`,
    `${t('originLabel')}: ${originText(preview.origin)}`,
  ]
  if (preview.replacesExisting) lines.push('', t('replaceNote'))
  for (const entry of preview.entries) {
    const form = entry.formAsset ? ` · ${entry.formAsset}` : ''
    const hash = entry.formAsset
      ? ` · ${entry.sha256Match ? t('shaOkLabel') : t('shaBadLabel')}`
      : ''
    lines.push(`- ${entry.name} [${entry.kind}] ${entry.license}${form}${hash}`)
    for (const problem of entry.problems) lines.push(`    ! ${problem}`)
  }
  if (preview.problems.length > 0) {
    lines.push('', `${t('problemsLabel')}:`, ...preview.problems.map((problem) => `  ! ${problem}`))
  }
  return lines.join('\n')
}

async function showMessage(
  parent: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
}

async function reviewAndInstall(
  deps: TenantPacksIpcDeps,
  prepared: TenantPackPrepared,
): Promise<TenantPackActionResult> {
  const lang = deps.lang()
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  const parent = deps.parentWindow()
  try {
    if (prepared.preview.problems.length > 0) {
      await showMessage(parent, {
        type: 'error',
        title: t('invalidTitle'),
        message: t('invalidTitle'),
        detail: `${t('invalidMessage')}\n\n${previewDetail(prepared.preview, lang)}`,
        buttons: [t('closeButton')],
        defaultId: 0,
        noLink: true,
      })
      return { ok: false, reason: 'invalid-pack', error: prepared.preview.problems.join('\n') }
    }

    const answer = await showMessage(parent, {
      type: 'question',
      title: t('previewTitle'),
      message: `${t('previewMessage')}\n${prepared.preview.pack.name} (${prepared.preview.pack.id})`,
      detail: previewDetail(prepared.preview, lang),
      buttons: [t('installButton'), t('cancelButton')],
      defaultId: 1,
      cancelId: 1,
      checkboxLabel: t('attestationLabel'),
      checkboxChecked: false,
      noLink: true,
    })
    if (answer.response !== 0) return { ok: true, canceled: true }
    if (!answer.checkboxChecked) {
      await showMessage(parent, {
        type: 'warning',
        title: t('attestationRequiredTitle'),
        message: t('attestationRequiredTitle'),
        detail: t('attestationRequiredMessage'),
        buttons: [t('closeButton')],
        noLink: true,
      })
      return { ok: false, reason: 'attestation-required' }
    }

    await installPreparedTenantPack(prepared, { attested: true })
    await showMessage(parent, {
      type: 'info',
      title: t('importedTitle'),
      message: t('importedTitle'),
      detail: t('importedMessage'),
      buttons: [t('closeButton')],
      noLink: true,
    })
    return { ok: true }
  } catch (error) {
    await showMessage(parent, {
      type: 'error',
      title: t('importFailedTitle'),
      message: t('importFailedTitle'),
      detail: tenantPackMessage(error),
      buttons: [t('closeButton')],
      noLink: true,
    })
    return actionFailure(error)
  } finally {
    await disposeTenantPack(prepared)
  }
}

async function importZipWithDialog(deps: TenantPacksIpcDeps): Promise<TenantPackActionResult> {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(deps.lang(), key)
  const parent = deps.parentWindow()
  const picked = await (parent
    ? dialog.showOpenDialog(parent, {
        title: t('zipDialogTitle'),
        properties: ['openFile'],
        filters: [{ name: t('zipFilterName'), extensions: ['zip'] }],
      })
    : dialog.showOpenDialog({
        title: t('zipDialogTitle'),
        properties: ['openFile'],
        filters: [{ name: t('zipFilterName'), extensions: ['zip'] }],
      }))
  const file = picked.canceled ? undefined : picked.filePaths[0]
  if (!file) return { ok: true, canceled: true }
  try {
    const prepared = await prepareTenantPackZip(file, { storeDir: storeDir(deps) })
    return await reviewAndInstall(deps, prepared)
  } catch (error) {
    return actionFailure(error)
  }
}

async function importFolderWithDialog(deps: TenantPacksIpcDeps): Promise<TenantPackActionResult> {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(deps.lang(), key)
  const parent = deps.parentWindow()
  const picked = await (parent
    ? dialog.showOpenDialog(parent, {
        title: t('folderDialogTitle'),
        properties: ['openDirectory'],
      })
    : dialog.showOpenDialog({
        title: t('folderDialogTitle'),
        properties: ['openDirectory'],
      }))
  const folder = picked.canceled ? undefined : picked.filePaths[0]
  if (!folder) return { ok: true, canceled: true }
  try {
    const prepared = await prepareTenantPackFolder(folder, {
      storeDir: storeDir(deps),
      homeDir: undefined,
    })
    return await reviewAndInstall(deps, prepared)
  } catch (error) {
    return actionFailure(error)
  }
}

/** The app menu's "Company template packs…" entry: list, then remove with confirmation. */
export async function showTenantPacksMenuDialog(): Promise<void> {
  const deps = current
  if (!deps) return
  const lang = deps.lang()
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  const parent = deps.parentWindow()
  let packs: TenantPackListItem[]
  try {
    packs = await listTenantPacks(storeDir(deps))
  } catch (error) {
    await showMessage(parent, {
      type: 'error',
      title: t('listTitle'),
      message: t('listTitle'),
      detail: tenantPackMessage(error),
      buttons: [t('closeButton')],
      noLink: true,
    })
    return
  }
  if (packs.length === 0) {
    await showMessage(parent, {
      type: 'info',
      title: t('listEmptyTitle'),
      message: t('listEmptyTitle'),
      detail: t('listEmptyMessage'),
      buttons: [t('closeButton')],
      noLink: true,
    })
    return
  }

  const list = await showMessage(parent, {
    type: 'info',
    title: t('listTitle'),
    message: `${t('listTitle')} (${packs.length})`,
    detail: packs.map((pack) => packLines(pack, lang).join('\n')).join('\n\n'),
    buttons: [t('removeButton'), t('closeButton')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (list.response !== 0) return

  const choice = await showMessage(parent, {
    type: 'question',
    title: t('removeSelectTitle'),
    message: t('removeSelectMessage'),
    detail: packs.map((pack) => packLines(pack, lang).join('\n')).join('\n\n'),
    buttons: [...packs.map((pack) => `${pack.name} (${pack.id})`), t('cancelButton')],
    defaultId: packs.length,
    cancelId: packs.length,
    noLink: true,
  })
  if (choice.response < 0 || choice.response >= packs.length) return
  const chosen = packs[choice.response]!

  const confirm = await showMessage(parent, {
    type: 'warning',
    title: t('removeConfirmTitle'),
    message: `${t('removeConfirmTitle')} ${chosen.name} (${chosen.id})`,
    detail: t('removeConfirmMessage'),
    buttons: [t('removeButton'), t('cancelButton')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (confirm.response !== 0) return

  try {
    const removed = await removeTenantPack(storeDir(deps), chosen.id)
    await showMessage(parent, {
      type: removed ? 'info' : 'error',
      title: removed ? t('removedTitle') : t('removeFailedTitle'),
      message: removed ? t('removedTitle') : t('removeFailedTitle'),
      detail: removed ? t('removedMessage') : t('listEmptyMessage'),
      buttons: [t('closeButton')],
      noLink: true,
    })
  } catch (error) {
    await showMessage(parent, {
      type: 'error',
      title: t('removeFailedTitle'),
      message: t('removeFailedTitle'),
      detail: tenantPackMessage(error),
      buttons: [t('closeButton')],
      noLink: true,
    })
  }
}

export function registerTenantPacksIpc(deps: TenantPacksIpcDeps): void {
  const manage = (
    channel: string,
    run: (event: IpcMainInvokeEvent, args: readonly unknown[]) => Promise<TenantPackActionResult>,
  ) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!deps.isMainWindow(event.sender)) {
        return { ok: false, reason: 'not-allowed' } satisfies TenantPackActionResult
      }
      try {
        return await run(event, args)
      } catch (error) {
        return actionFailure(error)
      }
    })
  }

  // Any window may list the current tenant's packs; the tenant is never an argument.
  ipcMain.handle(C.list, async () => {
    try {
      return {
        ok: true,
        packs: await listTenantPacks(storeDir(deps)),
      } satisfies TenantPackActionResult
    } catch (error) {
      return actionFailure(error)
    }
  })

  manage(C.importZip, () => importZipWithDialog(deps))
  manage(C.importFolder, () => importFolderWithDialog(deps))
  manage(C.remove, async (_event, args) => {
    const id = args[0]
    if (typeof id !== 'string') return { ok: false, reason: 'invalid' }
    const removed = await removeTenantPack(storeDir(deps), id)
    if (!removed) return { ok: false, reason: 'not-found' }
    return {
      ok: true,
      packs: await listTenantPacks(storeDir(deps)),
    } satisfies TenantPackActionResult
  })
}

/** Store the context and register the IPC handlers once. */
export function configureTenantPacks(deps: TenantPacksIpcDeps): void {
  current = deps
  registerTenantPacksIpc(deps)
}

export function importTenantPackZipFromMenu(): Promise<TenantPackActionResult> {
  return current ? importZipWithDialog(current) : Promise.resolve({ ok: false, reason: 'disabled' })
}

export function importTenantPackFolderFromMenu(): Promise<TenantPackActionResult> {
  return current
    ? importFolderWithDialog(current)
    : Promise.resolve({ ok: false, reason: 'disabled' })
}
