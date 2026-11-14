import academicGuideEn from './guides/academic/en.md?raw'
import academicGuideKo from './guides/academic/ko.md?raw'
import businessGuideEn from './guides/business/en.md?raw'
import businessGuideKo from './guides/business/ko.md?raw'
import { slideBriefLanguage } from './manifest'

export type AcademicGuideLanguage = 'ko' | 'en'
export type BusinessGuideLanguage = 'ko' | 'en'

/** The academic slide authoring guide for a UI language. */
export function academicSlideGuide(lang: string | null | undefined): string {
  return slideBriefLanguage(lang) === 'ko' ? academicGuideKo : academicGuideEn
}

/** The business slide authoring guide for a UI language. */
export function businessSlideGuide(lang: string | null | undefined): string {
  return slideBriefLanguage(lang) === 'ko' ? businessGuideKo : businessGuideEn
}

/** Slide brief ids whose guidance is the academic family. */
export const ACADEMIC_SLIDE_BRIEFS = [
  'academic-conference',
  'academic-seminar',
  'thesis-defense',
  'grant-briefing',
] as const

/** Slide brief ids whose guidance is the business family. */
export const BUSINESS_SLIDE_BRIEFS = [
  'executive-briefing',
  'board-report',
  'client-proposal',
  'project-retrospective',
] as const

export type SlideBriefFamily = 'academic' | 'business'

/** Which guide family a slide brief belongs to, or undefined for an unknown id. */
export function slideBriefFamily(briefId: string | null | undefined): SlideBriefFamily | undefined {
  if ((ACADEMIC_SLIDE_BRIEFS as readonly string[]).includes(briefId ?? '')) return 'academic'
  if ((BUSINESS_SLIDE_BRIEFS as readonly string[]).includes(briefId ?? '')) return 'business'
  return undefined
}

/**
 * The authoring guide for one slide brief and UI language. An unknown id
 * returns an empty string rather than silently attaching the wrong family.
 */
export function slideBriefGuide(
  briefId: string | null | undefined,
  lang: string | null | undefined,
): string {
  switch (slideBriefFamily(briefId)) {
    case 'academic':
      return academicSlideGuide(lang)
    case 'business':
      return businessSlideGuide(lang)
    default:
      return ''
  }
}
