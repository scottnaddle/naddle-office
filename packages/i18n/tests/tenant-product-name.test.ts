import { afterEach, describe, expect, it } from 'vitest'
import {
  brandText,
  PRODUCT_NAME,
  productName,
  setTenantProductNames,
  USER_DATA_DIR_NAME,
} from '../src/index'

afterEach(() => {
  setTenantProductNames(null)
  delete (globalThis as { naddleTenant?: unknown }).naddleTenant
})

describe('tenant product name override (P0-2)', () => {
  it('changes only the displayed name, not the installed app identity', () => {
    setTenantProductNames({ name: 'AcmeOffice', nameKo: '애크미오피스' })
    expect(productName('en')).toBe('AcmeOffice')
    expect(productName('ko')).toBe('애크미오피스')
    expect(productName('ja')).toBe('AcmeOffice')
    expect(PRODUCT_NAME).toBe('NaddleOffice')
    expect(USER_DATA_DIR_NAME).toBe('NaddleOffice')
    expect(brandText('GenOffice-<version>.AppImage', 'ko')).toBe('NaddleOffice-<version>.AppImage')
    expect(brandText('Open in GenOffice', 'ko')).toBe('Open in 애크미오피스')
  })

  it('falls back to the English name when only one name is set', () => {
    setTenantProductNames({ name: 'AcmeOffice' })
    expect(productName('ko')).toBe('AcmeOffice')
  })

  it('reads the preload snapshot when main did not set a name', () => {
    ;(globalThis as { naddleTenant?: unknown }).naddleTenant = {
      product: { name: 'AcmeOffice', nameKo: '애크미오피스' },
    }
    expect(productName('en')).toBe('AcmeOffice')
    expect(productName('ko')).toBe('애크미오피스')
  })

  it('ignores an empty or whitespace-only override', () => {
    setTenantProductNames({ name: '   ' })
    expect(productName('en')).toBe('NaddleOffice')
    ;(globalThis as { naddleTenant?: unknown }).naddleTenant = { product: { name: '  ' } }
    expect(productName('en')).toBe('NaddleOffice')
  })
})
