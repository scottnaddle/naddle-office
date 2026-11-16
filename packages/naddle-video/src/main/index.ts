/**
 * Main-process surface: the hidden offscreen stage, the fixed stage scripts
 * and the network guard. The shell imports this entry from its own main
 * process; it must have registered `VIDEO_SCHEME_PRIVILEGES` before app ready.
 */
export * from './stage'
export * from './stage-scripts'
export * from './stepper'
export * from './network-guard'
export * from './video-view'
