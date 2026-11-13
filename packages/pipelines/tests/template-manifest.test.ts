import { describe, expect, it } from 'vitest'
import ledger from '../../ui/src/authoring/builtin-templates.json'
import {
  SLIDE_TEMPLATE_SOURCE_COMMIT,
  SLIDE_TEMPLATE_SOURCE_REPO,
  listSlideTemplates,
} from '../src/slides/templates'

/**
 * The template manifest mirrors the slide catalog for provenance only; the
 * catalog stays the runtime source. This keeps the two in step.
 */
describe('template manifest slide designs', () => {
  const entries = ledger.entries.filter((entry) => entry.kind === 'slide-design')

  it('lists the catalog ids in display order', () => {
    expect(entries.map((entry) => entry.id)).toEqual(listSlideTemplates().map((t) => t.id))
  })

  it('matches each template name, scheme, description and source', () => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    for (const template of listSlideTemplates()) {
      const entry = byId.get(template.id)!
      expect(entry.name, template.id).toBe(template.name)
      expect(entry.scheme, template.id).toBe(template.scheme)
      expect(entry.description, template.id).toBe(template.description)
      expect(entry.license, template.id).toBe('MIT')
      expect(entry.source, template.id).toEqual({
        type: 'github',
        repo: SLIDE_TEMPLATE_SOURCE_REPO,
        commit: SLIDE_TEMPLATE_SOURCE_COMMIT,
        path: template.source.path,
      })
      expect(template.source.repo).toBe(SLIDE_TEMPLATE_SOURCE_REPO)
      expect(template.source.commit).toBe(SLIDE_TEMPLATE_SOURCE_COMMIT)
    }
  })
})
