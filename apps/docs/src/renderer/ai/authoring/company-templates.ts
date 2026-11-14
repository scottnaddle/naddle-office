/**
 * The "Company forms" group of the authoring gallery. Tenant packs are read
 * through the docs preload bridge; the cards carry only ids, name, pack name
 * and license, never a folder path. A pack whose forms failed the sha256
 * re-check is shown disabled.
 */
import type { TenantPackSummary } from '../../../shared/tenant-packs-api'

export interface CompanyFormCard {
  key: string
  packId: string
  entryId: string
  name: string
  description?: string
  license: string
  disabled: boolean
  disabledReason?: string
}

/** One card per installed form-skill entry that actually carries a form file. */
export function companyFormCards(packs: readonly TenantPackSummary[]): CompanyFormCard[] {
  const cards: CompanyFormCard[] = []
  for (const pack of packs) {
    const problem = pack.verified
      ? undefined
      : (pack.problems[0] ?? 'The form changed or is missing after installation.')
    for (const entry of pack.entries) {
      if (entry.kind !== 'form-skill' || !entry.formAsset) continue
      cards.push({
        key: `${pack.id}:${entry.id}`,
        packId: pack.id,
        entryId: entry.id,
        name: entry.name,
        description: pack.name,
        license: entry.license,
        disabled: problem !== undefined,
        ...(problem !== undefined ? { disabledReason: problem } : {}),
      })
    }
  }
  return cards
}

type CompanyTextKey =
  | 'heading'
  | 'empty'
  | 'open'
  | 'cancel'
  | 'instructionLabel'
  | 'instructionPlaceholder'
  | 'openFailed'
  | 'tampered'
  | 'license'

const EN: Record<CompanyTextKey, string> = {
  heading: 'Company forms',
  empty: 'No company forms are stored for this tenant yet.',
  open: 'Open a copy',
  cancel: 'Cancel',
  instructionLabel: 'What should the AI fill in? (optional)',
  instructionPlaceholder: 'For example: fill in today’s date and the requester.',
  openFailed: 'The company form could not be opened. Try importing the pack again.',
  tampered: 'The form changed or is missing. Ask an administrator to import the pack again.',
  license: 'License',
}

const KO: Record<CompanyTextKey, string> = {
  heading: '회사 양식',
  empty: '이 테넌트에 보관된 회사 양식이 아직 없습니다.',
  open: '사본 열기',
  cancel: '취소',
  instructionLabel: 'AI가 채울 내용(선택)',
  instructionPlaceholder: '예: 오늘 날짜와 신청자를 채워 주세요.',
  openFailed: '회사 양식을 열지 못했습니다. 팩을 다시 가져와 보세요.',
  tampered: '양식이 바뀌었거나 없습니다. 관리자에게 팩을 다시 가져오도록 요청하세요.',
  license: '라이선스',
}

const TABLES: Record<string, Record<CompanyTextKey, string>> = { en: EN, ko: KO }

export function companyText(lang: string | null | undefined, key: CompanyTextKey): string {
  const base = (lang ?? 'en').toLowerCase()
  const table = TABLES[base] ?? TABLES[base.split('-')[0] ?? ''] ?? EN
  return table[key]
}
