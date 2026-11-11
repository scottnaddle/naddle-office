import { useState, type CSSProperties, type ReactNode } from 'react'
import { authoringText } from './strings'
import type {
  AuthoringQuestion,
  BriefModel,
  BriefSection,
  GenerationStep,
  GenerationStepStatus,
} from './types'

export interface ClarifyCardProps {
  lang?: string | null
  questions: AuthoringQuestion[]
  busy?: boolean
  onSubmit: (answers: Record<string, string>) => void
  onSkip?: () => void
}

/** One question at a time, with a progress line and a skip path. */
export function ClarifyCard({ lang, questions, busy, onSubmit, onSkip }: ClarifyCardProps) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const question = questions[index]
  if (!question) return null
  const answer = answers[question.id] ?? ''
  const last = index === questions.length - 1
  const canContinue = !question.required || answer.trim().length > 0

  const commit = () => {
    if (!canContinue) return
    if (last) onSubmit(answers)
    else setIndex(index + 1)
  }

  return (
    <section className="authoring-card" aria-label={authoringText(lang, 'clarifyTitle')}>
      <div className="authoring-card-head">
        <strong>{authoringText(lang, 'clarifyTitle')}</strong>
        <span className="authoring-muted">
          {index + 1} / {questions.length}
        </span>
      </div>
      <label className="authoring-label" htmlFor={`authoring-q-${question.id}`}>
        {question.label}
      </label>
      {question.description && <p className="authoring-muted">{question.description}</p>}
      {question.options?.length ? (
        <div className="authoring-options" role="radiogroup" aria-label={question.label}>
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={answer === option.id}
              className={`authoring-option${answer === option.id ? ' is-selected' : ''}`}
              onClick={() => setAnswers({ ...answers, [question.id]: option.id })}
            >
              <span>{option.label}</span>
              {option.description && <small>{option.description}</small>}
            </button>
          ))}
        </div>
      ) : question.multiline ? (
        <textarea
          id={`authoring-q-${question.id}`}
          className="authoring-textarea"
          rows={4}
          placeholder={question.placeholder}
          value={answer}
          onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
        />
      ) : (
        <input
          id={`authoring-q-${question.id}`}
          className="authoring-input"
          placeholder={question.placeholder}
          value={answer}
          onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
        />
      )}
      <div className="authoring-actions">
        {onSkip && (
          <button type="button" className="authoring-btn" onClick={onSkip} disabled={busy}>
            {authoringText(lang, 'clarifySkip')}
          </button>
        )}
        <span className="authoring-spacer" />
        <button
          type="button"
          className="authoring-btn"
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0 || busy}
        >
          {authoringText(lang, 'clarifyBack')}
        </button>
        <button
          type="button"
          className="authoring-btn primary"
          onClick={commit}
          disabled={!canContinue || busy}
        >
          {last ? authoringText(lang, 'clarifySubmit') : authoringText(lang, 'clarifyNext')}
        </button>
      </div>
    </section>
  )
}

export interface BriefCardProps {
  lang?: string | null
  model: BriefModel
  busy?: boolean
  allowAddSection?: boolean
  onChange: (model: BriefModel) => void
  onConfirm: () => void
  onRegenerate?: () => void
  onCancel?: () => void
}

/** The editable brief: directions, fields and the section list. */
export function BriefCard({
  lang,
  model,
  busy,
  allowAddSection = true,
  onChange,
  onConfirm,
  onRegenerate,
  onCancel,
}: BriefCardProps) {
  const setField = (id: string, value: string) =>
    onChange({ ...model, fields: model.fields?.map((f) => (f.id === id ? { ...f, value } : f)) })
  const setSection = (id: string, patch: Partial<BriefSection>) =>
    onChange({
      ...model,
      sections: model.sections.map((section) =>
        section.id === id ? { ...section, ...patch } : section,
      ),
    })
  const moveSection = (id: string, direction: -1 | 1) => {
    const index = model.sections.findIndex((section) => section.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= model.sections.length) return
    const sections = [...model.sections]
    const [moved] = sections.splice(index, 1)
    if (moved) sections.splice(target, 0, moved)
    onChange({ ...model, sections })
  }
  const removeSection = (id: string) =>
    onChange({ ...model, sections: model.sections.filter((section) => section.id !== id) })
  const addSection = () =>
    onChange({
      ...model,
      sections: [...model.sections, { id: `custom-${Date.now()}`, title: '', detail: '' }],
    })

  return (
    <section className="authoring-card" aria-label={authoringText(lang, 'briefTitle')}>
      <div className="authoring-card-head">
        <strong>{authoringText(lang, 'briefTitle')}</strong>
      </div>
      <p className="authoring-muted">{authoringText(lang, 'briefHint')}</p>
      {model.warnings?.length ? (
        <ul className="authoring-warnings">
          {model.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {model.directions?.length ? (
        <div className="authoring-directions">
          {model.directions.map((direction) => {
            const selected = direction.id === model.selectedDirectionId
            return (
              <button
                key={direction.id}
                type="button"
                className={`authoring-direction${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onChange({ ...model, selectedDirectionId: direction.id })}
              >
                {direction.preview && (
                  <span
                    className="authoring-direction-preview"
                    style={{ background: direction.preview } as CSSProperties}
                  />
                )}
                <span>{direction.name}</span>
                {direction.description && <small>{direction.description}</small>}
              </button>
            )
          })}
        </div>
      ) : null}
      {model.fields?.length ? (
        <dl className="authoring-fields">
          {model.fields.map((field) => (
            <div key={field.id}>
              <dt>{field.label}</dt>
              <dd>
                {field.locked ? (
                  <span>{field.value || '—'}</span>
                ) : (
                  <input
                    className="authoring-input"
                    value={field.value}
                    onChange={(event) => setField(field.id, event.target.value)}
                    disabled={busy}
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <ol className="authoring-sections">
        {model.sections.map((section, index) => (
          <li key={section.id} className="authoring-section">
            <div className="authoring-section-row">
              <span className="authoring-muted">{index + 1}</span>
              <input
                className="authoring-input"
                value={section.title}
                aria-label={`section ${index + 1}`}
                onChange={(event) => setSection(section.id, { title: event.target.value })}
                disabled={busy || section.locked}
              />
              {!section.locked && (
                <div className="authoring-section-actions">
                  <button
                    type="button"
                    className="authoring-icon"
                    onClick={() => moveSection(section.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="authoring-icon"
                    onClick={() => moveSection(section.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="authoring-icon"
                    onClick={() => removeSection(section.id)}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            {section.meta && <span className="authoring-muted">{section.meta}</span>}
          </li>
        ))}
      </ol>
      {allowAddSection && !busy && (
        <button type="button" className="authoring-btn" onClick={addSection}>
          {authoringText(lang, 'briefAddSection')}
        </button>
      )}
      <div className="authoring-actions">
        {onCancel && (
          <button type="button" className="authoring-btn" onClick={onCancel} disabled={busy}>
            {authoringText(lang, 'briefCancel')}
          </button>
        )}
        {onRegenerate && (
          <button type="button" className="authoring-btn" onClick={onRegenerate} disabled={busy}>
            {authoringText(lang, 'briefRedo')}
          </button>
        )}
        <span className="authoring-spacer" />
        <button type="button" className="authoring-btn primary" onClick={onConfirm} disabled={busy}>
          {authoringText(lang, 'briefGenerate')}
        </button>
      </div>
    </section>
  )
}

export interface GenerationProgressProps {
  lang?: string | null
  steps: GenerationStep[]
  percent?: number | null
  outcome?: 'running' | 'done' | 'failed' | 'cancelled'
  onCancel?: () => void
  compact?: boolean
}

const stepMark: Record<GenerationStepStatus, string> = {
  todo: '○',
  running: '◐',
  done: '✓',
  error: '!',
  stopped: '■',
}

/** The shared progress list; the app reduces its stage events into `steps`. */
export function GenerationProgress({
  lang,
  steps,
  percent,
  outcome = 'running',
  onCancel,
  compact,
}: GenerationProgressProps) {
  const title =
    outcome === 'failed'
      ? authoringText(lang, 'progressFailed')
      : outcome === 'done'
        ? authoringText(lang, 'progressDone')
        : authoringText(lang, 'progressTitle')
  return (
    <section
      className={`authoring-card authoring-progress${compact ? ' is-compact' : ''}`}
      aria-label={title}
      data-outcome={outcome}
    >
      <div className="authoring-card-head">
        <strong>{title}</strong>
        {percent != null && <span className="authoring-muted">{Math.round(percent)}%</span>}
      </div>
      <ul className="authoring-steps">
        {steps.map((step) => (
          <li key={step.key} className={`authoring-step is-${step.status}`}>
            <span aria-hidden>{stepMark[step.status]}</span>
            <span>
              {step.status === 'done' ? step.summary || step.label : step.label}
              {step.total != null ? ` (${step.done ?? 0}/${step.total})` : ''}
            </span>
          </li>
        ))}
      </ul>
      {percent != null && (
        <div
          className="authoring-bar"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
      )}
      {onCancel && outcome === 'running' && (
        <div className="authoring-actions">
          <span className="authoring-spacer" />
          <button type="button" className="authoring-btn" onClick={onCancel}>
            {authoringText(lang, 'progressCancel')}
          </button>
        </div>
      )}
    </section>
  )
}

export interface AuthoringTemplateCard {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  scheme?: 'light' | 'dark' | 'mixed'
  previewText?: string
  disabled?: boolean
  disabledReason?: string
}

export interface TemplateGalleryProps {
  lang?: string | null
  templates: readonly AuthoringTemplateCard[]
  selectedId?: string | null
  onSelect: (id: string) => void
  variant?: 'start' | 'panel'
  emptyText?: string
  header?: ReactNode
}

/** The shared template grid. Grouping/filtering is left to the app's data. */
export function TemplateGallery({
  lang,
  templates,
  selectedId,
  onSelect,
  variant = 'panel',
  emptyText,
  header,
}: TemplateGalleryProps) {
  return (
    <section
      className={`authoring-card authoring-gallery is-${variant}`}
      aria-label={authoringText(lang, 'galleryTitle')}
    >
      <div className="authoring-card-head">
        <strong>{authoringText(lang, 'galleryTitle')}</strong>
      </div>
      {header}
      {templates.length === 0 ? (
        <p className="authoring-muted">{emptyText || authoringText(lang, 'galleryEmpty')}</p>
      ) : (
        <div className="authoring-template-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`authoring-template${selectedId === template.id ? ' is-selected' : ''}`}
              aria-pressed={selectedId === template.id}
              disabled={template.disabled}
              title={template.disabled ? template.disabledReason : template.description}
              onClick={() => onSelect(template.id)}
            >
              <span className="authoring-template-cover">
                {template.previewText || template.name.slice(0, 2)}
              </span>
              <span className="authoring-template-name">{template.name}</span>
              {template.description && <small>{template.description}</small>}
              {template.disabled && template.disabledReason && (
                <em className="authoring-muted">{template.disabledReason}</em>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export interface EditQueueItemView {
  id: string
  targetLabel: string
  instruction: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error?: string
}

export interface EditQueueCardProps {
  lang?: string | null
  items: EditQueueItemView[]
  busy?: boolean
  onChange: (items: EditQueueItemView[]) => void
  onSubmit: () => void
}

/** The same annotation queue every editor shows above its composer. */
export function EditQueueCard({ lang, items, busy, onChange, onSubmit }: EditQueueCardProps) {
  if (items.length === 0) return null
  return (
    <section className="authoring-card" aria-label={authoringText(lang, 'queueTitle')}>
      <div className="authoring-card-head">
        <strong>{authoringText(lang, 'queueTitle')}</strong>
        <span className="authoring-muted">{items.length}</span>
      </div>
      <ul className="authoring-queue">
        {items.map((item) => (
          <li key={item.id}>
            <span className="authoring-queue-target">{item.targetLabel}</span>
            <input
              className="authoring-input"
              value={item.instruction}
              disabled={busy || item.status === 'running'}
              onChange={(event) =>
                onChange(
                  items.map((entry) =>
                    entry.id === item.id ? { ...entry, instruction: event.target.value } : entry,
                  ),
                )
              }
            />
            <span className={`authoring-muted is-${item.status}`}>{item.status}</span>
          </li>
        ))}
      </ul>
      <div className="authoring-actions">
        <span className="authoring-spacer" />
        <button type="button" className="authoring-btn primary" onClick={onSubmit} disabled={busy}>
          {authoringText(lang, 'queueSubmit')}
        </button>
      </div>
    </section>
  )
}
