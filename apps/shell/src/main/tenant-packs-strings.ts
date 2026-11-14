/**
 * Menu labels and native dialog copy for tenant template packs. Kept out of
 * the large tMain dictionaries so the added feature does not need a row in
 * every language; English and Korean are provided and everything else falls
 * back to English.
 */
import type { Lang } from '@genoffice/i18n'

export type TenantPacksStringKey =
  | 'menuImportZip'
  | 'menuImportFolder'
  | 'menuManage'
  | 'zipDialogTitle'
  | 'folderDialogTitle'
  | 'zipFilterName'
  | 'previewTitle'
  | 'previewMessage'
  | 'replaceNote'
  | 'installButton'
  | 'cancelButton'
  | 'closeButton'
  | 'attestationLabel'
  | 'attestationRequiredTitle'
  | 'attestationRequiredMessage'
  | 'invalidTitle'
  | 'invalidMessage'
  | 'importedTitle'
  | 'importedMessage'
  | 'importFailedTitle'
  | 'listTitle'
  | 'listEmptyTitle'
  | 'listEmptyMessage'
  | 'removeButton'
  | 'removeSelectTitle'
  | 'removeSelectMessage'
  | 'removeConfirmTitle'
  | 'removeConfirmMessage'
  | 'removedTitle'
  | 'removedMessage'
  | 'removeFailedTitle'
  | 'licenseLabel'
  | 'authorLabel'
  | 'originLabel'
  | 'formsLabel'
  | 'shaOkLabel'
  | 'shaBadLabel'
  | 'problemsLabel'
  | 'verifiedLabel'
  | 'tamperedLabel'
  | 'noneLabel'
  | 'signatureLabel'
  | 'sigUnsigned'
  | 'sigValid'
  | 'sigBad'
  | 'sigUnknown'
  | 'sigRevoked'
  | 'sigExpired'
  | 'sigMissing'
  | 'sigUnreadable'
  | 'keyDialogTitle'
  | 'keyFilterName'
  | 'keyConfirmTitle'
  | 'keyConfirmMessage'
  | 'keyRegisterButton'

type Row = Record<TenantPacksStringKey, string>

const EN: Row = {
  menuImportZip: 'Import company template pack (zip)…',
  menuImportFolder: 'Import company template pack (folder)…',
  menuManage: 'Company template packs…',
  zipDialogTitle: 'Choose a company template pack (zip)',
  folderDialogTitle: 'Choose a company template pack folder',
  zipFilterName: 'Template pack',
  previewTitle: 'Company template pack',
  previewMessage: 'Review the pack before importing it.',
  replaceNote: 'A pack with this id already exists and will be replaced.',
  installButton: 'Import',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  attestationLabel:
    'This company (tenant) has the right to use these forms, and they are kept and used only inside this tenant. This is not permission to redistribute them publicly.',
  attestationRequiredTitle: 'Rights confirmation is required',
  attestationRequiredMessage: 'Tick the rights confirmation before importing the pack.',
  invalidTitle: 'This pack cannot be imported',
  invalidMessage: 'Fix the errors below and choose the pack again.',
  importedTitle: 'Company template pack imported',
  importedMessage: 'The pack is stored for this tenant only.',
  importFailedTitle: 'Import failed',
  listTitle: 'Company template packs',
  listEmptyTitle: 'No company template packs',
  listEmptyMessage: 'Import a zip or folder from the File or Help menu.',
  removeButton: 'Remove…',
  removeSelectTitle: 'Remove a company template pack',
  removeSelectMessage: 'Choose the pack to remove.',
  removeConfirmTitle: 'Remove this pack?',
  removeConfirmMessage: 'The pack and its forms will be removed from this tenant.',
  removedTitle: 'Company template pack removed',
  removedMessage: 'The pack is no longer stored for this tenant.',
  removeFailedTitle: 'Could not remove the pack',
  licenseLabel: 'License',
  authorLabel: 'Author',
  originLabel: 'Origin',
  formsLabel: 'forms',
  shaOkLabel: 'sha256 matches',
  shaBadLabel: 'sha256 does not match',
  problemsLabel: 'Problems',
  verifiedLabel: 'forms verified',
  tamperedLabel: 'forms changed or missing',
  noneLabel: 'none',
  signatureLabel: 'Signature',
  sigUnsigned: 'unsigned (allowed by the default policy)',
  sigValid: 'verified · {label} ({prefix})',
  sigBad: 'the signature does not match',
  sigUnknown: 'signed with an unregistered key',
  sigRevoked: 'signed with a revoked key',
  sigExpired: 'signed with an expired key',
  sigMissing: 'the signature is missing from an installed signed pack',
  sigUnreadable: 'the revoked-key list cannot be read',
  keyDialogTitle: 'Choose a public key (PEM)',
  keyFilterName: 'Public key',
  keyConfirmTitle: 'Register this signing key?',
  keyConfirmMessage: 'Only a public key can be registered. Check the key id with the pack author.',
  keyRegisterButton: 'Register',
}

const KO: Row = {
  menuImportZip: '회사 양식 팩 가져오기(zip)…',
  menuImportFolder: '회사 양식 팩 가져오기(폴더)…',
  menuManage: '회사 양식 팩…',
  zipDialogTitle: '회사 양식 팩(zip) 선택',
  folderDialogTitle: '회사 양식 팩 폴더 선택',
  zipFilterName: '양식 팩',
  previewTitle: '회사 양식 팩',
  previewMessage: '가져오기 전에 팩 내용을 확인하세요.',
  replaceNote: '같은 id의 팩이 이미 있어 새 팩으로 교체됩니다.',
  installButton: '가져오기',
  cancelButton: '취소',
  closeButton: '닫기',
  attestationLabel:
    '이 회사(테넌트)가 이 양식을 사용할 권리가 있으며, 이 테넌트 안에서만 보관·사용합니다. 공개 재배포를 뜻하지 않습니다.',
  attestationRequiredTitle: '권리 확인이 필요합니다',
  attestationRequiredMessage: '팩을 가져오려면 권리 확인에 체크하세요.',
  invalidTitle: '이 팩은 가져올 수 없습니다',
  invalidMessage: '아래 오류를 고친 뒤 팩을 다시 선택하세요.',
  importedTitle: '회사 양식 팩을 가져왔습니다',
  importedMessage: '이 팩은 현재 테넌트에만 보관됩니다.',
  importFailedTitle: '가져오기 실패',
  listTitle: '회사 양식 팩',
  listEmptyTitle: '회사 양식 팩이 없습니다',
  listEmptyMessage: '파일 또는 도움말 메뉴에서 zip이나 폴더를 가져오세요.',
  removeButton: '삭제…',
  removeSelectTitle: '회사 양식 팩 삭제',
  removeSelectMessage: '삭제할 팩을 선택하세요.',
  removeConfirmTitle: '이 팩을 삭제할까요?',
  removeConfirmMessage: '이 테넌트에서 팩과 양식 파일이 삭제됩니다.',
  removedTitle: '회사 양식 팩을 삭제했습니다',
  removedMessage: '이 테넌트에 더 이상 보관되지 않습니다.',
  removeFailedTitle: '팩을 삭제하지 못했습니다',
  licenseLabel: '라이선스',
  authorLabel: '작성자',
  originLabel: '출처',
  formsLabel: '개 양식',
  shaOkLabel: 'sha256 일치',
  shaBadLabel: 'sha256 불일치',
  problemsLabel: '문제',
  verifiedLabel: '양식 검증됨',
  tamperedLabel: '양식이 바뀌었거나 없음',
  noneLabel: '없음',
  signatureLabel: '서명',
  sigUnsigned: '서명 없음(기본 정책에서 허용)',
  sigValid: '서명 확인됨 · {label} ({prefix})',
  sigBad: '서명이 맞지 않습니다',
  sigUnknown: '등록되지 않은 키로 서명됨',
  sigRevoked: '폐기된 키로 서명됨',
  sigExpired: '만료된 키로 서명됨',
  sigMissing: '서명 팩에서 서명 파일이 없음',
  sigUnreadable: '폐기 키 목록을 읽을 수 없음',
  keyDialogTitle: '공개 키(PEM) 선택',
  keyFilterName: '공개 키',
  keyConfirmTitle: '이 서명 키를 등록할까요?',
  keyConfirmMessage: '공개 키만 등록할 수 있습니다. 팩 작성자와 키 id를 확인하세요.',
  keyRegisterButton: '등록',
}

const TABLES: Partial<Record<Lang, Row>> = { en: EN, ko: KO }

/** One label in the UI language, falling back to English. */
export function tenantPacksText(
  lang: Lang,
  key: TenantPacksStringKey,
  params: Readonly<Record<string, string>> = {},
): string {
  const value = (TABLES[lang] ?? EN)[key]
  return value.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}
