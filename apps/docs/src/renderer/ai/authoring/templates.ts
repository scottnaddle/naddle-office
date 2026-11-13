import { builtinTemplateEntries } from '@genoffice/ui'
import type { AuthoringQuestion, AuthoringTemplate, BriefModel, BriefSection } from '@genoffice/ui'

export interface DocumentTemplate extends AuthoringTemplate {
  questions: AuthoringQuestion[]
  sections: BriefSection[]
}

/**
 * The five S-grade office forms we author ourselves. They are structured
 * briefs (sections + fields), not downloaded public forms. The data lives in
 * the builtin template manifest (`packages/ui/src/authoring/builtin-templates.json`,
 * kind `document-brief`); this module keeps the shape the docs app uses.
 */
export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = builtinTemplateEntries(
  'document-brief',
).map(({ questions, sections, tags, ...entry }) => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  category: entry.category,
  ...(tags ? { tags: [...tags] } : {}),
  previewText: entry.previewText,
  questions: questions.map((question) =>
    question.options
      ? { ...question, options: question.options.map((option) => ({ ...option })) }
      : { ...question },
  ),
  sections: sections.map((item) => ({ ...item, detail: item.detail ?? '' })),
}))

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
