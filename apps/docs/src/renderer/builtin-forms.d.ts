import type {
  BuiltinFormActionResult,
  BuiltinFormGalleryApi,
  BuiltinFormOpenInput,
} from '../shared/builtin-forms-api'

declare global {
  interface Window {
    /** the shell's builtin office forms; absent outside the shell or with an older preload */
    aiOfficeBuiltinForms?: BuiltinFormGalleryApi
  }
}

export type { BuiltinFormActionResult, BuiltinFormOpenInput }
