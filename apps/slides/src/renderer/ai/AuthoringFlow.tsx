import './authoring-flow.css'

import { useEffect, useMemo, useState } from 'react'
import {
  BriefCard,
  ClarifyCard,
  GenerationProgress,
  TemplateGallery,
  authoringText,
  type BriefModel,
} from '@genoffice/ui'
import {
  buildSlideBrief,
  buildSlideBriefPrompt,
  slideBriefsFor,
  type SlideBriefTemplate,
} from './authoring/templates'

export interface AuthoringFlowProps {
  lang: string
  busy: boolean
  onGenerate: (instruction: string, displayText?: string) => void
  onClose: () => void
}

type Phase = 'gallery' | 'clarify' | 'brief' | 'generating' | 'done'

/**
 * The slides app's academic brief flow. Every stage before generation is local
 * and model-free; the confirmed brief and its guidance go to the existing
 * slides writer through onGenerate. The visual design template stays separate.
 */
export function AuthoringFlow({ lang, busy, onGenerate, onClose }: AuthoringFlowProps) {
  const [phase, setPhase] = useState<Phase>('gallery')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<BriefModel | null>(null)
  const [seenBusy, setSeenBusy] = useState(false)

  const templates = useMemo(() => slideBriefsFor(lang), [lang])
  const template = useMemo<SlideBriefTemplate | undefined>(
    () => templates.find((entry) => entry.id === templateId),
    [templates, templateId],
  )

  useEffect(() => {
    if (phase !== 'generating') return
    if (busy) setSeenBusy(true)
    else if (seenBusy) setPhase('done')
  }, [busy, phase, seenBusy])

  const startQuestions = (id: string) => {
    setTemplateId(id)
    setAnswers({})
    setBrief(null)
    setPhase('clarify')
  }

  const skipQuestions = () => {
    if (!template) return
    setBrief(buildSlideBrief(template, answers))
    setPhase('brief')
  }

  const answer = (next: Record<string, string>) => {
    if (!template) return
    setAnswers(next)
    setBrief(buildSlideBrief(template, next))
    setPhase('brief')
  }

  const confirm = () => {
    if (!template || !brief) return
    setPhase('generating')
    setSeenBusy(false)
    onGenerate(buildSlideBriefPrompt(template, answers, brief, lang), template.name)
  }

  const close = () => {
    setPhase('gallery')
    setTemplateId(null)
    setAnswers({})
    setBrief(null)
    setSeenBusy(false)
    onClose()
  }

  return (
    <div className="authoring-flow" data-phase={phase}>
      <div className="authoring-flow-head">
        <strong>{authoringText(lang, 'slideBriefGallery')}</strong>
        <button
          type="button"
          className="authoring-icon"
          aria-label={authoringText(lang, 'briefCancel')}
          onClick={close}
        >
          ×
        </button>
      </div>
      {phase === 'gallery' && (
        <TemplateGallery
          lang={lang}
          templates={templates}
          onSelect={startQuestions}
          variant="start"
          header={<p className="authoring-muted">{authoringText(lang, 'slideBriefHint')}</p>}
        />
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
              label: template ? template.name : authoringText(lang, 'progressTitle'),
              status: phase === 'done' ? 'done' : busy ? 'running' : 'todo',
            },
          ]}
          outcome={phase === 'done' ? 'done' : 'running'}
        />
      )}
    </div>
  )
}
