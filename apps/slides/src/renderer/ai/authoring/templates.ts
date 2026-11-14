import {
  academicSlideGuide,
  builtinTemplateEntries,
  resolveSlideBrief,
  slideBriefLanguage,
  type AuthoringQuestion,
  type BriefModel,
  type BriefSection,
  type SlideBriefLanguage,
} from '@genoffice/ui'

export interface SlideBriefTemplate {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  lang: SlideBriefLanguage
  questions: AuthoringQuestion[]
  sections: BriefSection[]
}

const ENTRIES = builtinTemplateEntries('slide-brief')

function templateFor(entry: (typeof ENTRIES)[number], lang: string): SlideBriefTemplate {
  const resolved = resolveSlideBrief(entry, lang)
  return {
    id: resolved.id,
    name: resolved.name,
    ...(resolved.description ? { description: resolved.description } : {}),
    ...(resolved.category ? { category: resolved.category } : {}),
    ...(resolved.tags ? { tags: resolved.tags } : {}),
    lang: slideBriefLanguage(lang),
    questions: resolved.questions,
    sections: resolved.sections,
  }
}

/** The four academic slide briefs with their Korean default copy. */
export const SLIDE_BRIEFS: readonly SlideBriefTemplate[] = ENTRIES.map((entry) =>
  templateFor(entry, 'ko'),
)

/** The four academic slide briefs resolved into the active UI language. */
export function slideBriefsFor(lang: string | null | undefined): SlideBriefTemplate[] {
  return ENTRIES.map((entry) => templateFor(entry, lang ?? 'en'))
}

export function slideBrief(
  id: string | null,
  lang: string | null | undefined,
): SlideBriefTemplate | undefined {
  return slideBriefsFor(lang).find((template) => template.id === id)
}

function answerFields(
  template: SlideBriefTemplate,
  answers: Record<string, string>,
): NonNullable<BriefModel['fields']> {
  return template.questions
    .map((question) => ({
      id: question.id,
      label: question.label,
      value: answers[question.id]?.trim() ?? '',
    }))
    .filter((field) => field.value.length > 0)
}

/** The brief shown before generation. Built locally, no model call. */
export function buildSlideBrief(
  template: SlideBriefTemplate,
  answers: Record<string, string>,
): BriefModel {
  return {
    title: answers.title?.trim() || template.name,
    fields: answerFields(template, answers),
    sections: template.sections.map((section) => ({ ...section })),
    warnings: [
      template.lang === 'ko'
        ? '브리프가 정한 섹션 순서는 고정입니다. 확인한 뒤 생성하세요.'
        : 'The brief fixes the section order. Review it before generating.',
    ],
  }
}

/** The instruction handed to the slides writer, including the academic guidance. */
export function buildSlideBriefPrompt(
  template: SlideBriefTemplate,
  answers: Record<string, string>,
  brief: BriefModel,
  lang: string | null | undefined,
): string {
  const language = slideBriefLanguage(lang)
  const answerLines = template.questions
    .map((question) => {
      const value = answers[question.id]?.trim()
      return value ? `- ${question.label}: ${value}` : null
    })
    .filter((line): line is string => Boolean(line))
    .join('\n')
  const sections = brief.sections
    .map((section, index) => `${index + 1}. ${section.title}`)
    .join('\n')
  const guidance = academicSlideGuide(language)
  if (language === 'ko') {
    return [
      `다음 ${template.name} 슬라이드 덱을 만들어 주세요.`,
      '',
      `브리프: ${template.name}${template.description ? ` — ${template.description}` : ''}`,
      '',
      '입력한 내용:',
      answerLines || '- (추가 입력 없음)',
      '',
      '섹션 순서(고정):',
      sections,
      '',
      '작성 규칙:',
      '- 이 작업은 문서가 아니라 발표용 슬라이드 덱입니다.',
      '- 화면용 시각 디자인 템플릿은 이 브리프와 별도로 고릅니다.',
      '- 위 섹션 순서를 지키고, 입력하지 않은 내용은 확인이 필요한 자리로 남겨 주세요.',
      '- 확인되지 않은 사실이나 인용을 새로 만들지 마세요.',
      '',
      '작성 지침:',
      guidance,
    ].join('\n')
  }
  return [
    `Please build the following ${template.name} slide deck.`,
    '',
    `Brief: ${template.name}${template.description ? ` — ${template.description}` : ''}`,
    '',
    'Answers:',
    answerLines || '- (no additional input)',
    '',
    'Section order (fixed):',
    sections,
    '',
    'Rules:',
    '- This is a slide deck for a talk, not a document.',
    '- The visual design template is chosen separately from this brief.',
    '- Keep the section order above and leave unverified details as explicit placeholders.',
    '- Do not invent facts, data or citations.',
    '',
    'Authoring guidance:',
    guidance,
  ].join('\n')
}
