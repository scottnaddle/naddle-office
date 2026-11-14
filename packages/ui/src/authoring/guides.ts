import academicGuideEn from './guides/academic/en.md?raw'
import academicGuideKo from './guides/academic/ko.md?raw'
import { slideBriefLanguage } from './manifest'

export type AcademicGuideLanguage = 'ko' | 'en'

/** The academic slide authoring guide for a UI language. */
export function academicSlideGuide(lang: string | null | undefined): string {
  return slideBriefLanguage(lang) === 'ko' ? academicGuideKo : academicGuideEn
}
