/**
 * Builds the ten builtin office forms (`.hwpx`) of the template ledger.
 *
 * Every form is written here from scratch: a title, a 결재란 (approval box with
 * 담당 / 검토 / 승인), and a body of labeled tables and paragraphs. Nothing is
 * downloaded or copied from an outside form, and the text uses generic
 * placeholders only (○○ 주식회사, empty cells). The files are made with the
 * repo's own Hangul support: the same `hwp apply` ops that
 * `ieumoffice create --type hwpx --ops <file> --out <path>` runs on the engine's
 * blank A4 document (packages/cli/src/formats/hwp-edit.ts).
 *
 * Run from the repository root (TypeScript sources are loaded through tsx):
 *
 *   node_modules/.bin/tsx packages/ui/scripts/generate-builtin-hwpx-forms.mjs
 *
 * It writes `packages/ui/src/authoring/assets/<id>.hwpx` and prints the sha256
 * of each file. With `--update-manifest` it also writes those hashes into
 * `packages/ui/src/authoring/builtin-templates.json` (only the `sha256` value
 * that follows each `assets/<id>.hwpx` path is replaced). With `--check` it
 * writes nothing and exits 1 when a generated file differs from the committed
 * one. The committed files and the ledger hashes are the source of truth; the
 * tests hash the committed bytes and never regenerate them.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyHwpOps,
  blankHwpForEdit,
  closeHwpSession,
  saveHwpSession,
} from '../../cli/src/formats/hwp-edit.ts'

const here = dirname(fileURLToPath(import.meta.url))
const authoringDir = resolve(here, '../src/authoring')
const assetsDir = join(authoringDir, 'assets')
const ledgerPath = join(authoringDir, 'builtin-templates.json')

const DATE = '      년      월      일'
/** The date line under a closing sentence; differs from DATE so a find never hits a table cell. */
const SIGNED_ON = '20    년    월    일'
const SIGN = '(서명)'

/** The approval box: one header row of roles and empty rows for position, signature and date. */
function approvalBox(roles = ['담당', '검토', '승인']) {
  const blank = roles.map(() => '')
  return [
    ['결재', ...roles],
    ['직위', ...blank],
    ['서명', ...blank],
    ['일자', ...blank],
  ]
}

/** Numbered empty rows for an item list. */
function numbered(count, columns) {
  return Array.from({ length: count }, (_, index) => [
    String(index + 1),
    ...Array.from({ length: columns - 1 }, () => ''),
  ])
}

/** A totals row: the label in the first cell, the rest empty. */
function totals(columns, label = '합계') {
  return [label, ...Array.from({ length: columns - 1 }, () => '')]
}

const ITEM_HEADER = ['번호', '품명', '규격', '수량', '단위', '단가', '금액', '비고']

/**
 * The forms. `blocks` run top to bottom after the title and the approval box:
 * `{ p: [...] }` adds paragraphs, `{ table: rows, header }` adds a table.
 * `center` lists paragraphs (by their exact text) to centre.
 */
const FORMS = [
  {
    id: 'draft',
    title: '기안서',
    roles: ['담당', '검토', '협조', '승인'],
    blocks: [
      {
        table: [
          ['문서번호', '', '기안일자', DATE],
          ['기안부서', '', '기안자', ''],
          ['보존기간', '', '시행일자', ''],
          ['수신', '', '참조', ''],
          ['제목', '', '', ''],
        ],
      },
      {
        p: [
          '',
          '1. 기안 목적',
          '',
          '2. 주요 내용',
          '  가. ',
          '  나. ',
          '',
          '3. 소요 예산 및 일정',
          '',
          '4. 기대 효과',
          '',
          '붙임  1. 관련 자료 1부.  끝.',
        ],
      },
    ],
  },
  {
    id: 'purchase-request',
    title: '구매품의서',
    blocks: [
      {
        table: [
          ['품의번호', '', '품의일자', DATE],
          ['요청부서', '', '요청자', ''],
          ['구매 목적', '', '', ''],
          ['납품 희망일', '', '납품 장소', ''],
        ],
      },
      { p: ['', '1. 구매 내역'] },
      { table: [ITEM_HEADER, ...numbered(5, 8), totals(8)], header: true },
      { p: ['', '2. 견적 비교'] },
      {
        table: [
          ['구분', '업체', '견적 금액', '납기', '비고'],
          ['견적 1', '', '', '', ''],
          ['견적 2', '', '', '', ''],
          ['견적 3', '', '', '', ''],
        ],
        header: true,
      },
      {
        p: [
          '',
          '3. 구매 사유 및 선정 근거',
          '',
          '위와 같이 구매하고자 하오니 승인하여 주시기 바랍니다.',
        ],
      },
    ],
    center: ['위와 같이 구매하고자 하오니 승인하여 주시기 바랍니다.'],
  },
  {
    id: 'trip-request',
    title: '출장신청서',
    blocks: [
      {
        table: [
          ['소속', '', '성명', ''],
          ['직위', '', '연락처', ''],
          ['출장지', '', '교통편', ''],
          ['출장 기간', '      년    월    일 ~       년    월    일 (   박   일)', '', ''],
          ['출장 목적', '', '', ''],
          ['동행자', '', '', ''],
        ],
      },
      { p: ['', '1. 출장 일정'] },
      {
        table: [
          ['일자', '시간', '방문처', '업무 내용'],
          ['', '', '', ''],
          ['', '', '', ''],
          ['', '', '', ''],
        ],
        header: true,
      },
      { p: ['', '2. 예상 경비'] },
      {
        table: [
          ['구분', '산출 내역', '금액', '비고'],
          ['교통비', '', '', ''],
          ['숙박비', '', '', ''],
          ['식비', '', '', ''],
          ['기타', '', '', ''],
          totals(4),
        ],
        header: true,
      },
      { p: ['', '위와 같이 출장을 신청합니다.', SIGNED_ON, `신청인                ${SIGN}`] },
    ],
    center: ['위와 같이 출장을 신청합니다.', SIGNED_ON],
  },
  {
    id: 'trip-report',
    title: '출장보고서',
    blocks: [
      {
        table: [
          ['소속', '', '성명', ''],
          ['직위', '', '보고일자', DATE],
          ['출장지', '', '', ''],
          ['출장 기간', '      년    월    일 ~       년    월    일 (   박   일)', '', ''],
          ['출장 목적', '', '', ''],
        ],
      },
      { p: ['', '1. 일자별 활동'] },
      {
        table: [
          ['일자', '방문처', '면담자', '활동 내용'],
          ['', '', '', ''],
          ['', '', '', ''],
          ['', '', '', ''],
        ],
        header: true,
      },
      { p: ['', '2. 출장 결과 및 성과', '', '3. 후속 조치', '', '4. 경비 정산'] },
      {
        table: [
          ['구분', '사용 내역', '금액', '증빙'],
          ['교통비', '', '', ''],
          ['숙박비', '', '', ''],
          ['식비', '', '', ''],
          ['기타', '', '', ''],
          totals(4),
        ],
        header: true,
      },
      { p: ['', '붙임  영수증 등 증빙 자료 각 1부.  끝.'] },
    ],
  },
  {
    id: 'leave-request',
    title: '휴가신청서',
    blocks: [
      {
        table: [
          ['소속', '', '성명', ''],
          ['직위', '', '연락처', ''],
        ],
      },
      { p: [''] },
      {
        table: [
          ['휴가 구분', '□ 연차   □ 반차(오전·오후)   □ 경조   □ 병가   □ 기타(        )'],
          ['휴가 기간', '      년    월    일 ~       년    월    일 (    일간)'],
          ['사유', ''],
          ['업무 대행자', ''],
          ['비상 연락처', ''],
        ],
      },
      { p: ['', '위와 같이 휴가를 신청합니다.', SIGNED_ON, `신청인                ${SIGN}`] },
    ],
    center: ['위와 같이 휴가를 신청합니다.', SIGNED_ON],
  },
  {
    id: 'corp-card',
    title: '법인카드 사용내역서',
    blocks: [
      {
        table: [
          ['소속', '', '사용자', ''],
          ['카드 번호(끝 4자리)', '', '사용 기간', ''],
        ],
      },
      { p: ['', '사용 내역'] },
      {
        table: [
          ['번호', '사용일자', '가맹점', '사용 목적', '계정과목', '금액', '증빙'],
          ...numbered(8, 7),
          totals(7),
        ],
        header: true,
      },
      {
        p: [
          '',
          '위와 같이 법인카드 사용 내역을 제출합니다.',
          SIGNED_ON,
          `제출자                ${SIGN}`,
          '',
          '붙임  카드 매출전표 각 1부.  끝.',
        ],
      },
    ],
    center: ['위와 같이 법인카드 사용 내역을 제출합니다.', SIGNED_ON],
  },
  {
    id: 'cooperation',
    title: '업무협조전',
    roles: ['담당', '검토', '협조', '승인'],
    blocks: [
      {
        table: [
          ['문서번호', '', '작성일자', DATE],
          ['발신 부서', '', '작성자', ''],
          ['수신 부서', '', '참조', ''],
          ['제목', '', '', ''],
          ['회신 기한', '', '', ''],
        ],
      },
      {
        p: [
          '',
          '1. 협조 요청 배경',
          '',
          '2. 협조 요청 내용',
          '  가. ',
          '  나. ',
          '',
          '3. 일정 및 기한',
          '',
          '4. 문의처',
          '',
          '붙임  1. 관련 자료 1부.  끝.',
          '',
          '회신',
        ],
      },
      {
        table: [
          ['회신 내용', ''],
          ['회신 부서', ''],
          ['회신자', ''],
          ['회신일자', ''],
        ],
      },
    ],
  },
  {
    id: 'statement',
    title: '거래명세서',
    blocks: [
      {
        table: [['거래일자', DATE, '번호', '']],
      },
      { p: [''] },
      {
        table: [
          ['구분', '공급자', '공급받는자'],
          ['등록번호', '', ''],
          ['상호', '', ''],
          ['대표자', '', ''],
          ['주소', '', ''],
          ['업태·종목', '', ''],
          ['연락처', '', ''],
        ],
        header: true,
      },
      { p: [''] },
      {
        table: [
          ['번호', '월일', '품목', '규격', '수량', '단가', '공급가액', '세액', '비고'],
          ...numbered(8, 9),
          totals(9),
        ],
        header: true,
      },
      { p: [''] },
      {
        table: [
          ['합계 금액(공급가액 + 세액)', ''],
          ['인수자', SIGN],
        ],
      },
      { p: ['', '위 금액을 정히 영수(청구)합니다.'] },
    ],
    center: ['위 금액을 정히 영수(청구)합니다.'],
  },
  {
    id: 'purchase-order',
    title: '발주서',
    blocks: [
      {
        table: [
          ['발주번호', '', '발주일자', DATE],
          ['수신(공급업체)', '', '참조', ''],
          ['납기일자', '', '납품 장소', ''],
          ['결제 조건', '', '', ''],
        ],
      },
      { p: [''] },
      {
        table: [
          ['발주처', '○○ 주식회사', '담당자', ''],
          ['연락처', '', '전자우편', ''],
        ],
      },
      { p: ['', '발주 내역'] },
      { table: [ITEM_HEADER, ...numbered(6, 8), totals(8)], header: true },
      {
        p: [
          '',
          '특기 사항',
          '1. 납품 시 거래명세서를 함께 보내 주시기 바랍니다.',
          '2. 규격·수량이 다르면 납품 전에 알려 주시기 바랍니다.',
          '',
          '위와 같이 발주합니다.',
          SIGNED_ON,
          `○○ 주식회사                ${SIGN}`,
        ],
      },
    ],
    center: ['위와 같이 발주합니다.', SIGNED_ON],
  },
  {
    id: 'official-letter',
    title: '공문(시행문)',
    blocks: [
      { p: ['', '○○ 주식회사'] },
      {
        table: [
          ['분류기호·문서번호', '', '시행일자', DATE],
          ['보존기간', '', '공개 구분', ''],
        ],
      },
      {
        p: [
          '',
          '수신  ○○○ (참조: ○○○)',
          '(경유)',
          '제목  ',
          '',
          '1. 관련: ',
          '',
          '2. 본문',
          '  가. ',
          '  나. ',
          '',
          '붙임  1. ○○○ 1부.  끝.',
          '',
          '○○ 주식회사 대표이사',
          '',
        ],
      },
      {
        table: [
          ['담당', '', '검토', '', '승인', ''],
          ['시행', '(분류기호·문서번호, 시행일자)', '접수', '', '', ''],
          ['주소', '', '', '', '', ''],
          ['전화', '', '전송', '', '전자우편', ''],
        ],
      },
    ],
    center: ['○○ 주식회사', '○○ 주식회사 대표이사'],
  },
]

/** The ops for one form, in the shape `ieumoffice hwp apply --ops` reads. */
function opsOf(form) {
  const ops = [
    { op: 'insert_paragraphs', where: 'end', paragraphs: [form.title, ''] },
    { op: 'insert_table', where: 'end', rows: approvalBox(form.roles), header: true },
  ]
  for (const block of form.blocks) {
    if (block.p) ops.push({ op: 'insert_paragraphs', where: 'end', paragraphs: block.p })
    else ops.push({ op: 'insert_table', where: 'end', rows: block.table, header: !!block.header })
  }
  ops.push({
    op: 'format_paragraph',
    find: form.title,
    occurrence: 1,
    align: 'center',
    bold: true,
    size: 20,
  })
  for (const text of form.center ?? []) {
    ops.push({ op: 'format_paragraph', find: text, occurrence: 1, align: 'center' })
  }
  return ops
}

async function build(form) {
  const session = await blankHwpForEdit()
  try {
    const outcome = await applyHwpOps(session, opsOf(form), 'atomic')
    if (outcome.failures.length > 0) {
      throw new Error(`${form.id}: ${JSON.stringify(outcome.failures)}`)
    }
    const saved = await saveHwpSession(session, 'hwpx')
    return Buffer.from(saved.bytes)
  } finally {
    closeHwpSession(session)
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const args = new Set(process.argv.slice(2))
const check = args.has('--check')
const updateManifest = args.has('--update-manifest')

const results = []
let stale = 0
for (const form of FORMS) {
  const bytes = await build(form)
  const path = join(assetsDir, `${form.id}.hwpx`)
  const hash = sha256(bytes)
  if (check) {
    const same = existsSync(path) && sha256(readFileSync(path)) === hash
    if (!same) stale += 1
    console.log(`${same ? 'same' : 'DIFF'}  assets/${form.id}.hwpx  ${hash}`)
  } else {
    mkdirSync(assetsDir, { recursive: true })
    writeFileSync(path, bytes)
    console.log(`wrote assets/${form.id}.hwpx  ${hash}`)
  }
  results.push({ id: form.id, hash })
}

if (updateManifest && !check) {
  let ledger = readFileSync(ledgerPath, 'utf8')
  for (const { id, hash } of results) {
    const pattern = new RegExp(
      `("path": "assets/${id}\\.hwpx"\\s*\\},\\s*"sha256": )(?:"[0-9a-f]{64}"|null)`,
    )
    if (!pattern.test(ledger)) throw new Error(`no formAsset entry for assets/${id}.hwpx`)
    ledger = ledger.replace(pattern, `$1"${hash}"`)
  }
  writeFileSync(ledgerPath, ledger)
  console.log('updated sha256 values in builtin-templates.json')
}

if (check && stale > 0) process.exit(1)
