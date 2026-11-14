import { describe, expect, it } from 'vitest'
import { REJECTED_TEMPLATE_ORIGINS, isRejectedTemplateOrigin } from '../src/authoring/manifest'

/**
 * S4 exports the vendor/marketplace origin rule so tenant packs can apply the
 * same rejection as builtin entries.
 */
describe('template origin rules', () => {
  it('exports the vendor and marketplace list', () => {
    expect(REJECTED_TEMPLATE_ORIGINS.length).toBeGreaterThan(0)
  })

  it.each([
    'Microsoft Office templates',
    'templates.office.com',
    'Google Workspace',
    'docs.google.com',
    'Hancom',
    '한컴',
    'Yesform',
    '예스폼',
    'Bizform',
    '비즈폼',
  ])('rejects %s', (value) => {
    expect(isRejectedTemplateOrigin(value)).toBe(true)
  })

  it('accepts an ordinary company author', () => {
    expect(isRejectedTemplateOrigin('Acme Company')).toBe(false)
    expect(isRejectedTemplateOrigin(undefined, null, 'Acme')).toBe(false)
  })

  it('checks every value it is given', () => {
    expect(isRejectedTemplateOrigin('Acme', undefined, 'Hancom')).toBe(true)
  })
})
