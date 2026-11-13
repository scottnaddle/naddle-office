import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/index'
import { hwpToText } from '../src/hwp'

/**
 * The ten builtin office forms of the template ledger
 * (packages/ui/src/authoring/assets, made by
 * packages/ui/scripts/generate-builtin-hwpx-forms.mjs) are read with the
 * repo's own Hangul reader, from the committed bytes. Each one must open, name
 * itself, carry a 결재란 table and, where amounts are listed, a 합계 row.
 */
const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../../ui/src/authoring/assets')

interface Form {
  id: string
  title: string
  /** the form lists amounts, so it needs a totals row */
  totals: boolean
}

const FORMS: Form[] = [
  { id: 'draft', title: '기안서', totals: false },
  { id: 'purchase-request', title: '구매품의서', totals: true },
  { id: 'trip-request', title: '출장신청서', totals: true },
  { id: 'trip-report', title: '출장보고서', totals: true },
  { id: 'leave-request', title: '휴가신청서', totals: false },
  { id: 'corp-card', title: '법인카드 사용내역서', totals: true },
  { id: 'cooperation', title: '업무협조전', totals: false },
  { id: 'statement', title: '거래명세서', totals: true },
  { id: 'purchase-order', title: '발주서', totals: true },
  { id: 'official-letter', title: '공문(시행문)', totals: false },
]

const pathOf = (id: string) => join(assets, `${id}.hwpx`)

describe('builtin hwpx office forms', () => {
  for (const form of FORMS) {
    it(`${form.id} opens and holds its title, a 결재란 and its body`, async () => {
      const bytes = readFileSync(pathOf(form.id))
      // an HWPX is a zip
      expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
      const text = await hwpToText(bytes)
      const lines = text.split('\n')
      expect(lines[0]).toBe(form.title)
      // the approval box is a table: its header row reads as one " | " row
      expect(lines).toContainEqual(
        expect.stringMatching(/^결재 \| 담당 \| (.+ \| )?검토 \| .*승인$/),
      )
      for (const label of ['담당', '검토', '승인']) expect(text, label).toContain(label)
      if (form.totals) expect(lines, '합계 row').toContain('합계')
    })
  }

  it('reads through the attachment path as an hwpx document', async () => {
    const result = await parseFileToText(pathOf('draft'))
    expect(JSON.stringify(result)).toContain('기안서')
  })

  it('leave request asks for a period and reason only, no leave balance', async () => {
    const text = await hwpToText(readFileSync(pathOf('leave-request')))
    expect(text).toContain('휴가 기간')
    expect(text).toContain('사유')
    expect(text).not.toMatch(/잔여|사용 일수|발생 일수/)
  })

  it('official letter has the parts of a 시행문 and no picture (no logo or seal)', async () => {
    const bytes = readFileSync(pathOf('official-letter'))
    const text = await hwpToText(bytes)
    for (const part of [
      '○○ 주식회사',
      '분류기호·문서번호',
      '시행일자',
      '수신',
      '제목',
      '본문',
      '끝.',
      '○○ 주식회사 대표이사',
      '붙임',
      '담당',
    ]) {
      expect(text, part).toContain(part)
    }
    expect(text).not.toContain('관인')
  })

  it('no form embeds a picture or other binary part', async () => {
    for (const form of FORMS) {
      const zip = await JSZip.loadAsync(readFileSync(pathOf(form.id)))
      const parts = Object.keys(zip.files)
      expect(
        parts.filter((name) => name.startsWith('BinData/')),
        form.id,
      ).toEqual([])
    }
  })
})
