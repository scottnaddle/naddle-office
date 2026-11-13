/**
 * Settings → company template packs copy. English and Korean are provided;
 * every other language falls back to English, like the main-process dialog
 * strings for the same feature.
 */
import type { Lang } from '@genoffice/i18n'

export type TenantPacksPaneStringKey =
  | 'navLabel'
  | 'title'
  | 'intro'
  | 'importZip'
  | 'importFolder'
  | 'importGitHub'
  | 'githubLabel'
  | 'githubPlaceholder'
  | 'githubHint'
  | 'previewTitle'
  | 'previewEmpty'
  | 'packLabel'
  | 'versionLabel'
  | 'publisherLabel'
  | 'licenseLabel'
  | 'authorLabel'
  | 'originLabel'
  | 'colName'
  | 'colKind'
  | 'colLicense'
  | 'colSha'
  | 'colProblems'
  | 'shaOk'
  | 'shaBad'
  | 'noForm'
  | 'packProblems'
  | 'replaceNote'
  | 'attestationLabel'
  | 'install'
  | 'cancel'
  | 'close'
  | 'loading'
  | 'emptyInstalled'
  | 'formsCount'
  | 'remove'
  | 'removeConfirm'
  | 'removeYes'
  | 'removeNo'
  | 'verified'
  | 'tampered'
  | 'errorTitle'
  | 'prepareFailed'
  | 'installFailed'
  | 'removeFailed'
  | 'canceled'

type Row = Record<TenantPacksPaneStringKey, string>

const EN: Row = {
  navLabel: 'Company forms',
  title: 'Company template packs',
  intro:
    'Import forms your company has the right to use. Packs are stored only for this tenant and are not shared or uploaded.',
  importZip: 'Import zip…',
  importFolder: 'Import folder…',
  importGitHub: 'Import from GitHub',
  githubLabel: 'GitHub address',
  githubPlaceholder: 'owner/repo or owner/repo/tree/main/folder',
  githubHint: 'A single skill address (owner/repo@name) is not a pack.',
  previewTitle: 'Review before importing',
  previewEmpty: 'Choose a zip, a folder or a GitHub address to see the preview.',
  packLabel: 'Pack',
  versionLabel: 'Version',
  publisherLabel: 'Publisher',
  licenseLabel: 'License',
  authorLabel: 'Author',
  originLabel: 'Origin',
  colName: 'Name',
  colKind: 'Kind',
  colLicense: 'License',
  colSha: 'sha256',
  colProblems: 'Problems',
  shaOk: 'matches',
  shaBad: 'does not match',
  noForm: 'no form file',
  packProblems: 'Pack problems',
  replaceNote: 'A pack with this id already exists and will be replaced.',
  attestationLabel:
    'This company (tenant) has the right to use these forms, and they are kept and used only inside this tenant. This is not permission to redistribute them publicly.',
  install: 'Import',
  cancel: 'Cancel',
  close: 'Close',
  loading: 'Loading…',
  emptyInstalled: 'No company template packs for this tenant yet.',
  formsCount: '{count} forms',
  remove: 'Remove…',
  removeConfirm: 'Remove {name}? The pack and its forms will be deleted from this tenant.',
  removeYes: 'Remove',
  removeNo: 'Cancel',
  verified: 'forms verified',
  tampered: 'forms changed or missing',
  errorTitle: 'The pack could not be imported',
  prepareFailed: 'The pack could not be read.',
  installFailed: 'The pack could not be installed.',
  removeFailed: 'The pack could not be removed.',
  canceled: 'Canceled.',
}

const KO: Row = {
  navLabel: '회사 양식',
  title: '회사 양식 팩',
  intro:
    '회사가 사용 권리를 가진 양식을 가져오세요. 팩은 이 테넌트에만 보관되며 공유하거나 업로드하지 않습니다.',
  importZip: 'zip 가져오기…',
  importFolder: '폴더 가져오기…',
  importGitHub: 'GitHub에서 가져오기',
  githubLabel: 'GitHub 주소',
  githubPlaceholder: 'owner/repo 또는 owner/repo/tree/main/folder',
  githubHint: '단일 스킬 주소(owner/repo@name)는 팩이 아닙니다.',
  previewTitle: '가져오기 전에 확인',
  previewEmpty: 'zip, 폴더 또는 GitHub 주소를 골라 미리보기를 확인하세요.',
  packLabel: '팩',
  versionLabel: '버전',
  publisherLabel: '배포자',
  licenseLabel: '라이선스',
  authorLabel: '작성자',
  originLabel: '출처',
  colName: '이름',
  colKind: '종류',
  colLicense: '라이선스',
  colSha: 'sha256',
  colProblems: '문제',
  shaOk: '일치',
  shaBad: '불일치',
  noForm: '양식 파일 없음',
  packProblems: '팩 문제',
  replaceNote: '같은 id의 팩이 이미 있어 새 팩으로 교체됩니다.',
  attestationLabel:
    '이 회사(테넌트)가 이 양식을 사용할 권리가 있으며, 이 테넌트 안에서만 보관·사용합니다. 공개 재배포를 뜻하지 않습니다.',
  install: '가져오기',
  cancel: '취소',
  close: '닫기',
  loading: '불러오는 중…',
  emptyInstalled: '이 테넌트에 보관된 회사 양식 팩이 없습니다.',
  formsCount: '양식 {count}개',
  remove: '삭제…',
  removeConfirm: '{name} 팩을 삭제할까요? 이 테넌트에서 팩과 양식 파일이 삭제됩니다.',
  removeYes: '삭제',
  removeNo: '취소',
  verified: '양식 검증됨',
  tampered: '양식이 바뀌었거나 없음',
  errorTitle: '팩을 가져올 수 없습니다',
  prepareFailed: '팩을 읽지 못했습니다.',
  installFailed: '팩을 설치하지 못했습니다.',
  removeFailed: '팩을 삭제하지 못했습니다.',
  canceled: '취소했습니다.',
}

const TABLES: Partial<Record<Lang, Row>> = { en: EN, ko: KO }

export function tenantPacksText(
  lang: Lang,
  key: TenantPacksPaneStringKey,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const value = (TABLES[lang] ?? EN)[key]
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
