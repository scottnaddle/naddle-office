import './authoring-flow.css'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BriefCard,
  ClarifyCard,
  GenerationProgress,
  TemplateGallery,
  authoringText,
  type BriefModel,
} from '@genoffice/ui'
import type { TenantPackSummary } from '../../shared/tenant-packs-api'
import { companyFormCards, companyText, type CompanyFormCard } from './authoring/company-templates'
import {
  DOCUMENT_TEMPLATES,
  buildDocumentBrief,
  buildDocumentPrompt,
  documentTemplate,
} from './authoring/templates'

export interface AuthoringFlowProps {
  lang: string
  busy: boolean
  onGenerate: (instruction: string) => void
  onClose: () => void
}

type Phase = 'gallery' | 'clarify' | 'brief' | 'generating' | 'done'

/**
 * The document app's template flow. Every stage before generation is local and
 * model-free; generation reuses the app's existing writer through onGenerate.
 * The "Company forms" group lists the current tenant's packs and opens a
 * verified form as a new tab through the shell; it never runs onGenerate.
 */
export function AuthoringFlow({ lang, busy, onGenerate, onClose }: AuthoringFlowProps) {
  const [phase, setPhase] = useState<Phase>('gallery')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<BriefModel | null>(null)
  const [seenBusy, setSeenBusy] = useState(false)
  const [companyPacks, setCompanyPacks] = useState<TenantPackSummary[]>([])
  const [companyLoaded, setCompanyLoaded] = useState(false)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companyChoice, setCompanyChoice] = useState<CompanyFormCard | null>(null)
  const [companyInstruction, setCompanyInstruction] = useState('')
  const [companyOpening, setCompanyOpening] = useState(false)

  const template = useMemo(() => documentTemplate(templateId), [templateId])
  const companyCards = useMemo(() => companyFormCards(companyPacks), [companyPacks])

  useEffect(() => {
    if (phase !== 'generating') return
    if (busy) setSeenBusy(true)
    else if (seenBusy) setPhase('done')
  }, [busy, phase, seenBusy])

  const loadCompanyForms = useCallback(async () => {
    const bridge = window.aiOfficeTenantPacks
    if (!bridge) {
      setCompanyPacks([])
      setCompanyLoaded(true)
      return
    }
    try {
      const result = await bridge.list()
      if (result.ok && result.packs) setCompanyPacks(result.packs)
      else setCompanyError(result.error ?? companyText(lang, 'openFailed'))
    } catch {
      setCompanyError(companyText(lang, 'openFailed'))
    } finally {
      setCompanyLoaded(true)
    }
  }, [lang])

  useEffect(() => {
    void loadCompanyForms()
  }, [loadCompanyForms])

  const startQuestions = (id: string) => {
    setTemplateId(id)
    setAnswers({})
    setBrief(null)
    setPhase('clarify')
  }

  const skipQuestions = () => {
    if (!template) return
    const model = buildDocumentBrief(template, answers)
    setBrief(model)
    setPhase('brief')
  }

  const answer = (next: Record<string, string>) => {
    if (!template) return
    setAnswers(next)
    setBrief(buildDocumentBrief(template, next))
    setPhase('brief')
  }

  const confirm = () => {
    if (!template || !brief) return
    setPhase('generating')
    setSeenBusy(false)
    onGenerate(buildDocumentPrompt(template, answers, brief))
  }

  const close = () => {
    setPhase('gallery')
    setTemplateId(null)
    setAnswers({})
    setBrief(null)
    setSeenBusy(false)
    onClose()
  }

  const chooseCompanyForm = (card: CompanyFormCard) => {
    if (card.disabled) return
    setCompanyError(null)
    setCompanyChoice(card)
    setCompanyInstruction('')
  }

  const openCompanyForm = async () => {
    const bridge = window.aiOfficeTenantPacks
    const choice = companyChoice
    if (!bridge || !choice || companyOpening) return
    setCompanyOpening(true)
    setCompanyError(null)
    try {
      const text = companyInstruction.trim()
      const result = await bridge.openForm({
        packId: choice.packId,
        entryId: choice.entryId,
        ...(text ? { text } : {}),
      })
      if (!result.ok) {
        setCompanyError(result.error ?? companyText(lang, 'openFailed'))
        return
      }
      setCompanyChoice(null)
      setCompanyInstruction('')
    } catch {
      setCompanyError(companyText(lang, 'openFailed'))
    } finally {
      setCompanyOpening(false)
    }
  }

  return (
    <div className="authoring-flow" data-phase={phase}>
      <div className="authoring-flow-head">
        <strong>{authoringText(lang, 'galleryOpen')}</strong>
        <button type="button" className="authoring-icon" aria-label="close" onClick={close}>
          ×
        </button>
      </div>
      {phase === 'gallery' && (
        <>
          <TemplateGallery
            lang={lang}
            templates={DOCUMENT_TEMPLATES}
            onSelect={startQuestions}
            variant="start"
          />
          <section className="authoring-company" data-testid="company-forms">
            <div className="authoring-card-head">
              <strong>{companyText(lang, 'heading')}</strong>
            </div>
            {companyError && (
              <p className="authoring-muted" role="alert">
                {companyError}
              </p>
            )}
            {!companyLoaded ? (
              <p className="authoring-muted">{authoringText(lang, 'galleryEmpty')}</p>
            ) : companyCards.length === 0 ? (
              <p className="authoring-muted">{companyText(lang, 'empty')}</p>
            ) : (
              <div className="authoring-template-grid">
                {companyCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`authoring-template${companyChoice?.key === card.key ? ' is-selected' : ''}`}
                    aria-pressed={companyChoice?.key === card.key}
                    disabled={card.disabled}
                    title={card.disabled ? card.disabledReason : card.description}
                    onClick={() => chooseCompanyForm(card)}
                  >
                    <span className="authoring-template-cover">{card.name.slice(0, 2)}</span>
                    <span className="authoring-template-name">{card.name}</span>
                    <small>{card.description}</small>
                    <small className="authoring-company-license">
                      {companyText(lang, 'license')}: {card.license}
                    </small>
                    {card.disabled && (
                      <em className="authoring-muted">
                        {card.disabledReason || companyText(lang, 'tampered')}
                      </em>
                    )}
                  </button>
                ))}
              </div>
            )}
            {companyChoice && (
              <div className="authoring-company-open" data-testid="company-form-open">
                <strong>{companyChoice.name}</strong>
                <label>
                  <span>{companyText(lang, 'instructionLabel')}</span>
                  <textarea
                    value={companyInstruction}
                    placeholder={companyText(lang, 'instructionPlaceholder')}
                    disabled={companyOpening}
                    onChange={(event) => setCompanyInstruction(event.target.value)}
                  />
                </label>
                <div className="authoring-actions">
                  <button
                    type="button"
                    className="authoring-btn is-primary"
                    disabled={companyOpening}
                    onClick={() => void openCompanyForm()}
                  >
                    {companyText(lang, 'open')}
                  </button>
                  <button
                    type="button"
                    className="authoring-btn"
                    disabled={companyOpening}
                    onClick={() => setCompanyChoice(null)}
                  >
                    {companyText(lang, 'cancel')}
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
      {phase === 'clarify' && template && (
        <ClarifyCard
          lang={lang}
          questions={template.questions}
          onSubmit={answer}
          onSkip={skipQuestions}
        />
      )}
      {phase === 'brief' && template && brief && (
        <BriefCard
          lang={lang}
          model={brief}
          onChange={setBrief}
          onConfirm={confirm}
          onCancel={close}
        />
      )}
      {(phase === 'generating' || phase === 'done') && (
        <GenerationProgress
          lang={lang}
          steps={[
            {
              key: 'write',
              label: template ? `${template.name} 작성` : '문서 작성',
              status: phase === 'done' ? 'done' : busy ? 'running' : 'todo',
            },
          ]}
          outcome={phase === 'done' ? 'done' : 'running'}
        />
      )}
    </div>
  )
}
