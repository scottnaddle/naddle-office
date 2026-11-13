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
 */
export function AuthoringFlow({ lang, busy, onGenerate, onClose }: AuthoringFlowProps) {
  const [phase, setPhase] = useState<Phase>('gallery')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<BriefModel | null>(null)
  const [seenBusy, setSeenBusy] = useState(false)

  const template = useMemo(() => documentTemplate(templateId), [templateId])

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

  return (
    <div className="authoring-flow" data-phase={phase}>
      <div className="authoring-flow-head">
        <strong>{authoringText(lang, 'galleryOpen')}</strong>
        <button type="button" className="authoring-icon" aria-label="close" onClick={close}>
          ×
        </button>
      </div>
      {phase === 'gallery' && (
        <TemplateGallery
          lang={lang}
          templates={DOCUMENT_TEMPLATES}
          onSelect={startQuestions}
          variant="start"
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
