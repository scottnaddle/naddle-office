import type { AuthoringQuestion, AuthoringTemplate, BriefModel, BriefSection } from '@genoffice/ui'

export interface DocumentTemplate extends AuthoringTemplate {
  questions: AuthoringQuestion[]
  sections: BriefSection[]
}

const section = (id: string, title: string, detail = ''): BriefSection => ({ id, title, detail })

/**
 * The five S-grade office forms we author ourselves. They are structured
 * briefs (sections + fields), not downloaded public forms.
 */
export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
  {
    id: 'quote',
    name: '견적서',
    description: '품목·수량·단가와 유효기간을 정리한 견적 문서',
    category: '영업',
    tags: ['견적', '거래'],
    previewText: '₩',
    questions: [
      {
        id: 'customer',
        label: '받는 곳(고객 또는 발주처)',
        required: true,
        placeholder: '예: ○○ 주식회사 구매팀',
      },
      {
        id: 'items',
        label: '견적 항목과 수량·단가',
        description: '한 줄에 하나씩 적어 주세요. 금액은 시스템이 합계를 정리합니다.',
        multiline: true,
        required: true,
        placeholder: '예: 노트북 10대 × 1,500,000원',
      },
      {
        id: 'tax',
        label: '세금 포함 여부',
        options: [
          { id: 'included', label: '부가세 포함' },
          { id: 'excluded', label: '부가세 별도' },
        ],
        required: true,
      },
      { id: 'valid', label: '견적 유효기간', placeholder: '예: 발행일로부터 30일' },
    ],
    sections: [
      section('info', '견적 정보'),
      section('items', '품목 및 금액'),
      section('total', '합계 및 조건'),
      section('validity', '유효기간 및 서명'),
    ],
  },
  {
    id: 'approval',
    name: '품의서',
    description: '목적·내용·예산·일정을 갖춘 내부 승인 요청',
    category: '내부 결재',
    tags: ['품의', '승인'],
    previewText: '✓',
    questions: [
      { id: 'title', label: '품의 제목', required: true },
      { id: 'purpose', label: '목적과 배경', multiline: true, required: true },
      { id: 'amount', label: '예상 금액', placeholder: '예: 3,500,000원' },
      { id: 'period', label: '기간 또는 일정', placeholder: '예: 2026-12-01 ~ 2026-12-15' },
      { id: 'requester', label: '요청 부서·담당자' },
    ],
    sections: [
      section('purpose', '목적 및 배경'),
      section('content', '내용'),
      section('budget', '예산'),
      section('schedule', '일정'),
      section('approval', '승인'),
    ],
  },
  {
    id: 'expense',
    name: '지출결의서',
    description: '지출 내역·증빙·승인을 한 장으로 정리',
    category: '재무',
    tags: ['지출', '정산'],
    previewText: '₩',
    questions: [
      { id: 'date', label: '지출 일자', placeholder: '예: 2026-11-30' },
      { id: 'payee', label: '지급 대상', required: true },
      { id: 'amount', label: '지출 금액', required: true },
      { id: 'account', label: '계정 또는 예산 항목' },
      { id: 'purpose', label: '지출 목적과 내역', multiline: true, required: true },
    ],
    sections: [
      section('summary', '지출 개요'),
      section('detail', '지출 내역'),
      section('evidence', '증빙'),
      section('approval', '승인'),
    ],
  },
  {
    id: 'minutes',
    name: '회의록',
    description: '안건·논의·결정·후속 조치를 남기는 회의 기록',
    category: '협업',
    tags: ['회의', '기록'],
    previewText: '≡',
    questions: [
      { id: 'meeting', label: '회의 이름', required: true },
      { id: 'date', label: '일시와 장소' },
      { id: 'attendees', label: '참석자', multiline: true },
      { id: 'agenda', label: '안건', multiline: true, required: true },
    ],
    sections: [
      section('info', '회의 정보'),
      section('discussion', '논의'),
      section('decisions', '결정 사항'),
      section('followup', '후속 조치'),
    ],
  },
  {
    id: 'report',
    name: '업무 보고',
    description: '진행 상황·이슈·다음 단계를 정리한 업무 보고',
    category: '보고',
    tags: ['보고', '진행'],
    previewText: '↗',
    questions: [
      { id: 'period', label: '보고 기간', placeholder: '예: 2026년 11월 2주' },
      { id: 'owner', label: '작성자·담당' },
      { id: 'summary', label: '핵심 요약', multiline: true, required: true },
      { id: 'issues', label: '이슈와 위험', multiline: true },
      { id: 'next', label: '다음 단계', multiline: true },
    ],
    sections: [
      section('summary', '요약'),
      section('progress', '진행 상황'),
      section('issues', '이슈 및 위험'),
      section('next', '다음 단계'),
    ],
  },
]

export function documentTemplate(id: string | null): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id)
}

export function answersToFields(
  template: DocumentTemplate,
  answers: Record<string, string>,
): BriefModel['fields'] {
  return template.questions
    .map((question) => ({
      id: question.id,
      label: question.label,
      value: answers[question.id]?.trim() ?? '',
    }))
    .filter((field) => field.value.length > 0)
}

/** The brief shown before generation. Built locally, no model call. */
export function buildDocumentBrief(
  template: DocumentTemplate,
  answers: Record<string, string>,
): BriefModel {
  return {
    title: answers.title?.trim() || template.name,
    fields: answersToFields(template, answers),
    sections: template.sections.map((item) => ({ ...item })),
    warnings: ['템플릿이 정한 섹션 순서와 서식은 고정입니다. 내용과 항목만 수정할 수 있습니다.'],
  }
}

/** The instruction handed to the existing document writer. */
export function buildDocumentPrompt(
  template: DocumentTemplate,
  answers: Record<string, string>,
  brief: BriefModel,
): string {
  const answerLines = template.questions
    .map((question) => {
      const value = answers[question.id]?.trim()
      return value ? `- ${question.label}: ${value}` : null
    })
    .filter(Boolean)
    .join('\n')
  const sections = brief.sections.map((item, index) => `${index + 1}. ${item.title}`).join('\n')
  return [
    `다음 템플릿으로 완성된 ${template.name} 문서를 작성해 주세요.`,
    '',
    `템플릿: ${template.name} — ${template.description}`,
    '',
    '입력한 내용:',
    answerLines || '- (추가 입력 없음)',
    '',
    '문서 구조(순서 고정):',
    sections,
    '',
    '작성 규칙:',
    '- 위 구조를 그대로 사용하고, 입력하지 않은 값은 확인이 필요한 자리로 남겨 주세요.',
    '- 표가 필요한 곳은 실제 표로 만들고, 합계와 날짜 형식을 일관되게 맞춰 주세요.',
    '- 확인되지 않은 사실이나 금액을 새로 만들지 마세요.',
    '- 간결한 업무 문체로 작성해 주세요.',
  ].join('\n')
}
