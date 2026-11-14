/**
 * The tenant template pack entry points in main: native dialogs from the app
 * menu and the narrow IPC bridge. Import writes only under the current
 * tenant's `template-packs` folder; no tenant value comes from a renderer.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { Lang } from '@genoffice/i18n'
import {
  TenantPackError,
  disposeTenantPack,
  inspectPublicKeyPem,
  installedFormPath,
  installPreparedTenantPack,
  listTenantPacks,
  prepareTenantPackFolder,
  prepareTenantPackGitHub,
  prepareTenantPackZip,
  readRevokedPackKeys,
  readTenantPackIndex,
  readTrustedPackKeys,
  registerTrustedPackKey,
  removeTenantPack,
  removeTrustedPackKey,
  revokePackKey,
  tenantPackMessage,
  tenantPackStoreDir,
  type PackSignatureInfo,
  type RevokedPackKey,
  type TenantPackListItem,
  type TenantPackOrigin,
  type TenantPackPrepared,
  type TenantPackPreview,
  type TrustedPackKey,
} from '@naddle/template-packs'
import {
  TENANT_PACKS_CHANNELS as C,
  type TenantPackActionResult,
  type TenantPackEntryPreviewView,
  type TenantPackOriginView,
  type TenantPackPreviewView,
  type TenantPackRevokedKeyView,
  type TenantPackSignatureView,
  type TenantPackSummary,
  type TenantPackTrustedKeyView,
} from '../shared/tenant-packs-api'
import { tenantPacksText } from './tenant-packs-strings'

/** The `fetch` main injects (Electron's `net.fetch` in the app, a fake in tests). */
type TenantPackFetch = Parameters<typeof prepareTenantPackGitHub>[1]['fetch']

export interface TenantPackCopyInput {
  bytes: Uint8Array
  fileName: string
  title: string
  text?: string | undefined
}

export interface TenantPackCopyResult {
  ok: boolean
  tabId?: string | undefined
  reason?: string | undefined
}

export interface TenantPacksIpcDeps {
  userDataDir: () => string
  /** from the main-process tenant snapshot only; no renderer value is read */
  tenantId: string | undefined
  lang: () => Lang
  parentWindow: () => BrowserWindow | null
  isMainWindow: (sender: WebContents) => boolean
  /** GitHub reads go through Electron's `net.fetch` in the app */
  fetch?: TenantPackFetch | undefined
  /** copy verified form bytes into a new untitled tab; no skill is registered */
  openFormCopy?: ((input: TenantPackCopyInput) => Promise<TenantPackCopyResult>) | undefined
}

interface StashedPrepare {
  prepared: TenantPackPrepared
  ownerId: number
}

const prepares = new Map<string, StashedPrepare>()
const watchedSenders = new Set<number>()
const PREPARE_TTL_MS = 10 * 60 * 1000

let current: TenantPacksIpcDeps | null = null

function storeDir(deps: TenantPacksIpcDeps): string {
  return tenantPackStoreDir(deps.userDataDir(), deps.tenantId)
}

function actionFailure(error: unknown): TenantPackActionResult {
  const reason = error instanceof TenantPackError ? error.code : 'failed'
  return { ok: false, reason, error: tenantPackMessage(error) }
}

/** A source label safe to show in a renderer: no absolute folder path. */
function originView(origin: TenantPackOrigin): TenantPackOriginView {
  switch (origin.kind) {
    case 'zip':
      return { kind: 'zip', file: basename(origin.file) }
    case 'folder':
      return { kind: 'folder', folder: basename(origin.folder) }
    case 'github':
      return {
        kind: 'github',
        repo: origin.repo,
        ref: origin.ref,
        commit: origin.commit,
        path: origin.path,
      }
  }
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

function signatureView(signature: PackSignatureInfo | undefined): TenantPackSignatureView {
  if (!signature) return { status: 'unsigned' }
  return {
    status: signature.status,
    ...(signature.keyId ? { keyId: signature.keyId } : {}),
    ...(signature.keyLabel ? { keyLabel: signature.keyLabel } : {}),
    ...(signature.signedAt ? { signedAt: signature.signedAt } : {}),
    ...(signature.trustSource ? { trustSource: signature.trustSource } : {}),
  }
}

function trustedKeyView(key: TrustedPackKey): TenantPackTrustedKeyView {
  return {
    keyId: key.keyId,
    label: key.label,
    ...(key.addedAt ? { addedAt: key.addedAt } : {}),
    ...(key.notAfter ? { notAfter: key.notAfter } : {}),
  }
}

function revokedKeyView(key: RevokedPackKey): TenantPackRevokedKeyView {
  return {
    keyId: key.keyId,
    ...(key.revokedAt ? { revokedAt: key.revokedAt } : {}),
    ...(key.reason ? { reason: key.reason } : {}),
  }
}

function summaryOf(pack: TenantPackListItem): TenantPackSummary {
  return {
    id: pack.id,
    name: pack.name,
    version: pack.version,
    ...(pack.publisher ? { publisher: pack.publisher } : {}),
    license: pack.license,
    author: pack.author,
    origin: originView(pack.origin),
    installedAt: pack.installedAt,
    formCount: pack.formCount,
    verified: pack.verified,
    problems: pack.problems,
    signature: signatureView(pack.signatureInfo),
    signatureStatus: pack.signatureStatus,
    entries: pack.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      license: entry.license,
      author: entry.author,
      skillPath: entry.skillPath,
      ...(entry.formAsset ? { formAsset: entry.formAsset } : {}),
      ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
    })),
  }
}

function previewEntryView(entry: TenantPackPreview['entries'][number]): TenantPackEntryPreviewView {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    license: entry.license,
    author: entry.author,
    skillPath: entry.skillPath,
    ...(entry.formAsset ? { formAsset: entry.formAsset } : {}),
    ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
    sha256Match: entry.sha256Match,
    problems: entry.problems,
  }
}

function previewView(preview: TenantPackPreview): TenantPackPreviewView {
  return {
    pack: {
      id: preview.pack.id,
      name: preview.pack.name,
      version: preview.pack.version,
      ...(preview.pack.publisher ? { publisher: preview.pack.publisher } : {}),
      ...(preview.pack.description ? { description: preview.pack.description } : {}),
    },
    origin: originView(preview.origin),
    license: preview.license,
    licenseNormalized: preview.licenseNormalized,
    author: preview.author,
    entries: preview.entries.map(previewEntryView),
    problems: preview.problems,
    requiresAttestation: preview.requiresAttestation,
    replacesExisting: preview.replacesExisting,
    signature: signatureView(preview.signature),
  }
}

async function packsResult(deps: TenantPacksIpcDeps): Promise<TenantPackActionResult> {
  const packs = await listTenantPacks(storeDir(deps))
  return { ok: true, packs: packs.map(summaryOf) }
}

async function keysResult(deps: TenantPacksIpcDeps): Promise<TenantPackActionResult> {
  const dir = storeDir(deps)
  const [keys, revoked] = await Promise.all([readTrustedPackKeys(dir), readRevokedPackKeys(dir)])
  return {
    ok: true,
    keys: keys.map(trustedKeyView),
    revoked: revoked.keys.map(revokedKeyView),
  }
}

/** Pick a public-key PEM, confirm its key id, then register it for this tenant. */
async function registerKeyWithDialog(deps: TenantPacksIpcDeps): Promise<TenantPackActionResult> {
  const lang = deps.lang()
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  const parent = deps.parentWindow()
  const picked = await (parent
    ? dialog.showOpenDialog(parent, {
        title: t('keyDialogTitle'),
        properties: ['openFile'],
        filters: [{ name: t('keyFilterName'), extensions: ['pem', 'pub'] }],
      })
    : dialog.showOpenDialog({
        title: t('keyDialogTitle'),
        properties: ['openFile'],
        filters: [{ name: t('keyFilterName'), extensions: ['pem', 'pub'] }],
      }))
  if (picked.canceled || !picked.filePaths[0]) return { ok: true, canceled: true }
  const file = picked.filePaths[0]
  const pem = await readFile(file, 'utf8')
  const parsed = inspectPublicKeyPem(pem)
  const label = basename(file, extname(file)) || undefined
  const confirm = await showMessage(parent, {
    type: 'question',
    title: t('keyConfirmTitle'),
    message: `${t('keyConfirmTitle')} ${parsed.keyId}`,
    detail: `${t('keyConfirmMessage')}\n${parsed.keyId}${label ? `\n${label}` : ''}`,
    buttons: [t('keyRegisterButton'), t('cancelButton')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (confirm.response !== 0) return { ok: true, canceled: true }
  await registerTrustedPackKey(storeDir(deps), {
    publicKeyPem: parsed.publicKeyPem,
    ...(label ? { label } : {}),
  })
  return await keysResult(deps)
}

async function disposeStash(token: string): Promise<void> {
  const stashed = prepares.get(token)
  if (!stashed) return
  prepares.delete(token)
  await disposeTenantPack(stashed.prepared)
}

/** Drop every prepared preview a window owned when that window goes away. */
function watchSender(sender: WebContents): void {
  if (watchedSenders.has(sender.id)) return
  watchedSenders.add(sender.id)
  if (typeof sender.once !== 'function') return
  sender.once('destroyed', () => {
    watchedSenders.delete(sender.id)
    for (const [token, stashed] of prepares) {
      if (stashed.ownerId !== sender.id) continue
      prepares.delete(token)
      void disposeTenantPack(stashed.prepared)
    }
  })
}

function stashPrepared(prepared: TenantPackPrepared, ownerId: number): string {
  const token = randomUUID()
  prepares.set(token, { prepared, ownerId })
  setTimeout(() => void disposeStash(token), PREPARE_TTL_MS).unref?.()
  return token
}

function preparedResult(token: string, prepared: TenantPackPrepared): TenantPackActionResult {
  return { ok: true, prepareToken: token, preview: previewView(prepared.preview) }
}

type PrepareOutcome =
  { canceled: true } | { prepared: TenantPackPrepared } | { failure: TenantPackActionResult }

async function prepareZipForPane(deps: TenantPacksIpcDeps): Promise<PrepareOutcome> {
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
  if (!file) return { canceled: true }
  try {
    return { prepared: await prepareTenantPackZip(file, { storeDir: storeDir(deps) }) }
  } catch (error) {
    return { failure: actionFailure(error) }
  }
}

async function prepareFolderForPane(deps: TenantPacksIpcDeps): Promise<PrepareOutcome> {
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
  if (!folder) return { canceled: true }
  try {
    return {
      prepared: await prepareTenantPackFolder(folder, {
        storeDir: storeDir(deps),
        homeDir: undefined,
      }),
    }
  } catch (error) {
    return { failure: actionFailure(error) }
  }
}

async function showMessage(
  parent: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
}

function signatureText(info: PackSignatureInfo | undefined, lang: Lang): string {
  const t = (
    key: Parameters<typeof tenantPacksText>[1],
    params: Readonly<Record<string, string>> = {},
  ) => tenantPacksText(lang, key, params)
  switch (info?.status ?? 'unsigned') {
    case 'unsigned':
      return t('sigUnsigned')
    case 'valid':
      return t('sigValid', {
        label: info?.keyLabel ?? '',
        prefix: (info?.keyId ?? '').replace(/^ed25519:/, '').slice(0, 8),
      })
    case 'unknown-key':
      return t('sigUnknown')
    case 'revoked-key':
      return t('sigRevoked')
    case 'expired-key':
      return t('sigExpired')
    case 'missing-signature':
      return t('sigMissing')
    case 'trust-store-unreadable':
      return t('sigUnreadable')
    default:
      return t('sigBad')
  }
}

function packLines(pack: TenantPackListItem, lang: Lang): string[] {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  return [
    `${pack.name} (${pack.id}) ${pack.version}`,
    `  ${t('licenseLabel')}: ${pack.license}`,
    `  ${t('authorLabel')}: ${pack.author}`,
    `  ${t('originLabel')}: ${originText(originView(pack.origin))}`,
    `  ${pack.formCount} ${t('formsLabel')} · ${pack.verified ? t('verifiedLabel') : t('tamperedLabel')}`,
    `  ${t('signatureLabel')}: ${signatureText(pack.signatureInfo, lang)}`,
    ...pack.problems.map((problem) => `  ! ${problem}`),
  ]
}

function previewDetail(preview: TenantPackPreview, lang: Lang): string {
  const t = (key: Parameters<typeof tenantPacksText>[1]) => tenantPacksText(lang, key)
  const lines: string[] = [
    `${preview.pack.name} (${preview.pack.id}) ${preview.pack.version}`,
    `${t('licenseLabel')}: ${preview.license}${preview.licenseNormalized ? ' (CC0 -> CC0-1.0)' : ''}`,
    `${t('authorLabel')}: ${preview.author || t('noneLabel')}`,
    `${t('originLabel')}: ${originText(originView(preview.origin))}`,
    `${t('signatureLabel')}: ${signatureText(preview.signature, lang)}`,
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

/**
 * Read one installed form only after `installedFormPath` re-checked its bytes
 * against the index sha256, then copy it into a new untitled tab. No pack
 * folder path reaches the renderer and nothing is written back to the store.
 */
async function openForm(deps: TenantPacksIpcDeps, input: unknown): Promise<TenantPackActionResult> {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'invalid' }
  const record = input as Record<string, unknown>
  const packId = record.packId
  const entryId = record.entryId
  const text = record.text
  if (typeof packId !== 'string' || typeof entryId !== 'string') {
    return { ok: false, reason: 'invalid' }
  }
  if (text !== undefined && typeof text !== 'string') return { ok: false, reason: 'invalid' }
  if (!deps.openFormCopy) return { ok: false, reason: 'disabled' }

  const dir = storeDir(deps)
  const formPath = await installedFormPath(dir, packId, entryId)
  if (!formPath) {
    return {
      ok: false,
      reason: 'tampered',
      error: 'The form is missing or its hash does not match. Remove the pack and import it again.',
    }
  }
  try {
    const bytes = new Uint8Array(await readFile(formPath))
    const index = await readTenantPackIndex(dir)
    const pack = index.packs.find((item) => item.id === packId)
    const entry = pack?.entries.find((item) => item.id === entryId)
    // Re-hash the bytes the copy will use, so a change between the check and
    // the read is caught too. The index is the only expected hash.
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (!entry?.sha256 || digest !== entry.sha256) {
      return {
        ok: false,
        reason: 'tampered',
        error: 'The form changed before it could be opened. Remove the pack and import it again.',
      }
    }
    const fileName = basename(formPath)
    const stem = fileName.slice(0, fileName.length - extname(fileName).length) || fileName
    const opened = await deps.openFormCopy({
      bytes,
      fileName,
      title: entry?.name || stem,
      ...(text !== undefined ? { text } : {}),
    })
    if (!opened.ok) {
      return { ok: false, reason: opened.reason ?? 'failed' }
    }
    return { ok: true, ...(opened.tabId ? { tabId: opened.tabId } : {}) }
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
      watchSender(event.sender)
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
      return await packsResult(deps)
    } catch (error) {
      return actionFailure(error)
    }
  })

  // A document window may open a verified form; only the bytes cross this call.
  ipcMain.handle(C.openForm, async (_event, ...args: unknown[]) => {
    try {
      return await openForm(deps, args[0])
    } catch (error) {
      return actionFailure(error)
    }
  })

  manage(C.importZip, () => importZipWithDialog(deps))
  manage(C.importFolder, () => importFolderWithDialog(deps))

  manage(C.prepareZip, async (event) => {
    const outcome = await prepareZipForPane(deps)
    if ('failure' in outcome) return outcome.failure
    if ('canceled' in outcome) return { ok: true, canceled: true }
    const token = stashPrepared(outcome.prepared, event.sender.id)
    return preparedResult(token, outcome.prepared)
  })

  manage(C.prepareFolder, async (event) => {
    const outcome = await prepareFolderForPane(deps)
    if ('failure' in outcome) return outcome.failure
    if ('canceled' in outcome) return { ok: true, canceled: true }
    const token = stashPrepared(outcome.prepared, event.sender.id)
    return preparedResult(token, outcome.prepared)
  })

  manage(C.prepareGitHub, async (event, args) => {
    const address = args[0]
    if (typeof address !== 'string' || address.trim() === '') {
      return { ok: false, reason: 'invalid' }
    }
    const fetchImpl = deps.fetch
    if (!fetchImpl) return { ok: false, reason: 'disabled' }
    try {
      const prepared = await prepareTenantPackGitHub(address.trim(), {
        storeDir: storeDir(deps),
        fetch: fetchImpl,
      })
      const token = stashPrepared(prepared, event.sender.id)
      return preparedResult(token, prepared)
    } catch (error) {
      return actionFailure(error)
    }
  })

  manage(C.confirmInstall, async (_event, args) => {
    const token = args[0]
    const attested = args[1] === true
    if (typeof token !== 'string') return { ok: false, reason: 'invalid' }
    const stashed = prepares.get(token)
    if (!stashed) return { ok: false, reason: 'not-found' }
    if (!attested) return { ok: false, reason: 'attestation-required' }
    if (stashed.prepared.preview.problems.length > 0) {
      return {
        ok: false,
        reason: 'invalid-pack',
        error: stashed.prepared.preview.problems.join('\n'),
      }
    }
    prepares.delete(token)
    try {
      await installPreparedTenantPack(stashed.prepared, { attested: true })
      return await packsResult(deps)
    } catch (error) {
      return actionFailure(error)
    } finally {
      await disposeTenantPack(stashed.prepared)
    }
  })

  manage(C.cancelPrepare, async (_event, args) => {
    const token = args[0]
    if (typeof token !== 'string') return { ok: false, reason: 'invalid' }
    await disposeStash(token)
    return { ok: true }
  })

  manage(C.remove, async (_event, args) => {
    const id = args[0]
    if (typeof id !== 'string') return { ok: false, reason: 'invalid' }
    const removed = await removeTenantPack(storeDir(deps), id)
    if (!removed) return { ok: false, reason: 'not-found' }
    return await packsResult(deps)
  })

  manage(C.listKeys, () => keysResult(deps))
  manage(C.registerKey, () => registerKeyWithDialog(deps))
  manage(C.removeKey, async (_event, args) => {
    const keyId = args[0]
    if (typeof keyId !== 'string') return { ok: false, reason: 'invalid' }
    const removed = await removeTrustedPackKey(storeDir(deps), keyId)
    if (!removed) return { ok: false, reason: 'not-found' }
    return await keysResult(deps)
  })
  manage(C.revokeKey, async (_event, args) => {
    const keyId = args[0]
    if (typeof keyId !== 'string') return { ok: false, reason: 'invalid' }
    await revokePackKey(storeDir(deps), keyId)
    return await keysResult(deps)
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
