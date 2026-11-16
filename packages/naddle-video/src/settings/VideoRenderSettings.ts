/**
 * Framework-agnostic view model for the video render settings pane. A later
 * approved slice can render this with React inside the shell settings modal;
 * this slice does not edit or import any counted shell file.
 */
import { DEFAULT_REMOTE_LABEL, INSECURE_LAN_HTTP, REMOTE_TARGET_ENABLED } from './types'
import type { VideoSettings } from './types'
import { validateVideoSettings } from './validate'

export type VideoSettingsLang = 'en' | 'ko'

export interface VideoRenderSettingsCopy {
  title: string
  targetLabel: string
  inApp: string
  remote: string
  remoteDisabled: string
  endpointLabel: string
  endpointHint: string
  tokenRefLabel: string
  tokenRefHint: string
  labelLabel: string
  lanHttpWarning: string
}

const COPY: Record<VideoSettingsLang, VideoRenderSettingsCopy> = {
  en: {
    title: 'Video render server',
    targetLabel: 'Render on',
    inApp: 'This app',
    remote: 'Remote server',
    remoteDisabled: 'Available after server approval',
    endpointLabel: 'Server endpoint',
    endpointHint: 'https anywhere; http only on a local network',
    tokenRefLabel: 'Token reference',
    tokenRefHint: 'env:NAME or file:/absolute/path (the value is never stored or read here)',
    labelLabel: 'Display name',
    lanHttpWarning: 'This endpoint uses plain http on a local network. Traffic is not encrypted.',
  },
  ko: {
    title: '영상 렌더 서버',
    targetLabel: '렌더 위치',
    inApp: '이 앱',
    remote: '원격 서버',
    remoteDisabled: '서버 승인 후 사용할 수 있습니다',
    endpointLabel: '서버 주소',
    endpointHint: 'https는 어디서나, http는 로컬 네트워크에서만 쓸 수 있습니다',
    tokenRefLabel: '토큰 참조',
    tokenRefHint: 'env:이름 또는 file:/절대경로 (값은 여기서 저장하거나 읽지 않습니다)',
    labelLabel: '표시 이름',
    lanHttpWarning: '로컬 네트워크의 http 주소입니다. 통신이 암호화되지 않습니다.',
  },
}

export interface VideoRenderTargetOption {
  id: 'in-app' | 'remote'
  label: string
  disabled: boolean
  disabledReason?: string
}

export interface VideoRenderSettingsWarning {
  code: string
  message: string
}

export interface VideoRenderSettingsView {
  copy: VideoRenderSettingsCopy
  selectedTarget: VideoSettings['renderTarget']
  targetOptions: VideoRenderTargetOption[]
  endpoint: string
  tokenRef: string
  label: string
  warning: VideoRenderSettingsWarning | null
  errors: string[]
}

/** Returns the copy for a language, falling back to English. */
export function videoRenderSettingsCopy(lang: string): VideoRenderSettingsCopy {
  return lang === 'ko' ? COPY.ko : COPY.en
}

/**
 * Builds the pane state. The remote target stays disabled until a later slice,
 * and a plain-http LAN endpoint always carries a visible warning.
 */
export function videoRenderSettingsView(
  settings: VideoSettings,
  lang: string = 'en',
): VideoRenderSettingsView {
  const copy = videoRenderSettingsCopy(lang)
  const validation = validateVideoSettings(settings)
  const warning = validation.warnings.includes(INSECURE_LAN_HTTP)
    ? { code: INSECURE_LAN_HTTP, message: copy.lanHttpWarning }
    : null

  return {
    copy,
    selectedTarget: settings.renderTarget,
    targetOptions: [
      { id: 'in-app', label: copy.inApp, disabled: false },
      {
        id: 'remote',
        label: copy.remote,
        disabled: !REMOTE_TARGET_ENABLED,
        disabledReason: REMOTE_TARGET_ENABLED ? undefined : copy.remoteDisabled,
      },
    ],
    endpoint: settings.remote?.endpoint ?? '',
    tokenRef: settings.remote?.tokenRef ?? '',
    label: settings.remote?.label ?? DEFAULT_REMOTE_LABEL,
    warning,
    errors: validation.errors,
  }
}
