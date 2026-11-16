/**
 * Fixed scripts the main process may run in the stage. They are written here
 * once and never assembled from model output; `frameSeekScript` only inserts a
 * validated integer.
 */

/** Waits for fonts and images so the first captured frame is complete. */
export const STAGE_READY_SCRIPT = `(async function () {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready
  } catch (error) {}
  try {
    var images = Array.prototype.slice.call(document.images || [])
    await Promise.all(images.map(function (image) {
      if (image && image.decode) return image.decode().catch(function () {})
      return Promise.resolve()
    }))
  } catch (error) {}
  if (document.body && document.body.getBoundingClientRect) {
    document.body.getBoundingClientRect()
  }
  return true
})()`

/** Flushes queued animation-frame callbacks twice, which lets one callback schedule the next. */
export const STAGE_FLUSH_SCRIPT = `(function () {
  var clock = window.__naddleClock
  if (clock) {
    clock.flushRaf()
    clock.flushRaf()
  }
  return true
})()`

/**
 * Seeks the scene to `ms`: the page's own `window.naddleVideo.seek(ms)` first,
 * then every Web Animations timeline, then the virtual clock and its rAF queue.
 */
export function frameSeekScript(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError('frameSeekScript needs a finite, non-negative time')
  }
  const target = Math.round(ms)
  return `(function () {
  var target = ${target}
  var clock = window.__naddleClock
  try {
    if (window.naddleVideo && typeof window.naddleVideo.seek === 'function') {
      window.naddleVideo.seek(target)
    }
  } catch (error) {}
  try {
    var animations = document.getAnimations ? document.getAnimations() : []
    for (var i = 0; i < animations.length; i++) {
      try {
        animations[i].currentTime = target
      } catch (error) {}
    }
  } catch (error) {}
  if (clock) {
    clock.advanceTo(target)
    clock.flushRaf()
    clock.advanceTo(target)
    clock.flushRaf()
  }
  return true
})()`
}
