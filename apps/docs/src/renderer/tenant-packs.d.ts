import type {
  TenantPackActionResult,
  TenantPackGalleryApi,
  TenantPackOpenFormInput,
} from '../shared/tenant-packs-api'

declare global {
  interface Window {
    /** the shell's company template packs; absent outside the shell or with an older preload */
    aiOfficeTenantPacks?: TenantPackGalleryApi
  }
}

export type { TenantPackActionResult, TenantPackOpenFormInput }
