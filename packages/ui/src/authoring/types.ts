/** Shared model for the in-app AI authoring flow (template -> questions -> brief -> generate). */

export type AuthoringKind = 'document' | 'slides' | 'video'

export type AuthoringStage =
  'idle' | 'template' | 'clarify' | 'brief' | 'generating' | 'review' | 'done'

export interface AuthoringQuestionOption {
  id: string
  label: string
  description?: string
}

export interface AuthoringQuestion {
  id: string
  label: string
  description?: string
  options?: AuthoringQuestionOption[]
  /** Free text instead of options. */
  multiline?: boolean
  placeholder?: string
  required?: boolean
}

export interface AuthoringDirection {
  id: string
  name: string
  description?: string
  palette?: string[]
  preview?: string
}

export interface BriefField {
  id: string
  label: string
  value: string
  locked?: boolean
}

export interface BriefSection {
  id: string
  title: string
  detail?: string
  meta?: string
  locked?: boolean
}

export interface BriefModel {
  title: string
  hook?: string
  directions?: AuthoringDirection[]
  selectedDirectionId?: string
  fields?: BriefField[]
  sections: BriefSection[]
  warnings?: string[]
}

export interface AuthoringTemplate {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  scheme?: 'light' | 'dark' | 'mixed'
  /** A short label or emoji-free mark drawn by the gallery card. */
  previewText?: string
  disabled?: boolean
  disabledReason?: string
}

export type GenerationStepStatus = 'todo' | 'running' | 'done' | 'error' | 'stopped'

export interface GenerationStep {
  key: string
  label: string
  status: GenerationStepStatus
  done?: number
  total?: number
  summary?: string
}

export type AuthoringOutcome = 'running' | 'done' | 'failed' | 'cancelled'

export interface AuthoringFlowState {
  stage: AuthoringStage
  templateId: string | null
  answers: Record<string, string>
  brief: BriefModel | null
  steps: GenerationStep[]
  percent: number | null
  outcome: AuthoringOutcome
  error: string | null
}

export type AuthoringEvent =
  | { type: 'START' }
  | { type: 'PICK_TEMPLATE'; templateId: string }
  | { type: 'ANSWER'; answers: Record<string, string> }
  | { type: 'BRIEF_READY'; brief: BriefModel }
  | { type: 'BRIEF_EDIT'; brief: BriefModel }
  | { type: 'CONFIRM_BRIEF' }
  | { type: 'PROGRESS'; steps: GenerationStep[]; percent?: number | null }
  | { type: 'REVIEW' }
  | { type: 'DONE' }
  | { type: 'CANCEL' }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' }

export function initialAuthoringState(): AuthoringFlowState {
  return {
    stage: 'idle',
    templateId: null,
    answers: {},
    brief: null,
    steps: [],
    percent: null,
    outcome: 'running',
    error: null,
  }
}

/** The one transition table every authoring panel shares. */
export function authoringFlowReducer(
  state: AuthoringFlowState,
  event: AuthoringEvent,
): AuthoringFlowState {
  switch (event.type) {
    case 'START':
      return { ...initialAuthoringState(), stage: 'template' }
    case 'PICK_TEMPLATE':
      return {
        ...state,
        stage: 'clarify',
        templateId: event.templateId,
        answers: {},
        brief: null,
        steps: [],
        percent: null,
        outcome: 'running',
        error: null,
      }
    case 'ANSWER':
      return { ...state, answers: { ...state.answers, ...event.answers } }
    case 'BRIEF_READY':
    case 'BRIEF_EDIT':
      return { ...state, stage: 'brief', brief: event.brief }
    case 'CONFIRM_BRIEF':
      if (!state.brief) return state
      return { ...state, stage: 'generating', outcome: 'running', error: null }
    case 'PROGRESS':
      return {
        ...state,
        steps: event.steps,
        ...(event.percent === undefined ? {} : { percent: event.percent }),
      }
    case 'REVIEW':
      return { ...state, stage: 'review', outcome: 'running' }
    case 'DONE':
      return { ...state, stage: 'done', outcome: 'done', percent: 100 }
    case 'CANCEL':
      return { ...state, stage: 'idle', outcome: 'cancelled', steps: [] }
    case 'FAIL':
      return { ...state, stage: 'generating', outcome: 'failed', error: event.error }
    case 'RESET':
      return initialAuthoringState()
    default:
      return state
  }
}
