/**
 * The deterministic clock injected into a staged scene before any page script.
 *
 * It replaces the wall clock with virtual time: `performance.now()`,
 * `Date.now()` (fixed epoch), `requestAnimationFrame`, `setTimeout`,
 * `setInterval` and `Math.random` (fixed seed). Nothing here talks to the
 * host; the renderer only calls `window.__naddleClock.seek(ms)` and
 * `flushRaf()` through fixed main-process scripts.
 *
 * The script is a plain IIFE string because it is inserted into generated
 * HTML, which is not a module. Tests run this exact string in a `vm` context,
 * so the code under test is the code that ships to the stage.
 */
export const CLOCK_RUNTIME_SCRIPT = `;(function (global) {
  'use strict'
  if (global.__naddleClock) return
  var EPOCH = 1700000000000
  var MAX_CALLBACKS = 1000000
  var state = {
    time: 0,
    seed: 0x9e3779b9 >>> 0,
    nextTimerId: 1,
    nextRafId: 1,
    timers: {},
    raf: {}
  }

  function now() {
    return state.time
  }

  function random() {
    state.seed = (state.seed + 0x6d2b79f5) >>> 0
    var t = state.seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function schedule(fn, delay, argsLike, repeating) {
    if (typeof fn !== 'function') throw new TypeError('naddle clock: callback must be a function')
    var d = Number(delay)
    if (!isFinite(d) || d < 0) d = 0
    var id = state.nextTimerId++
    var args = []
    for (var i = 2; i < argsLike.length; i++) args.push(argsLike[i])
    state.timers[id] = {
      id: id,
      at: state.time + d,
      fn: fn,
      args: args,
      every: repeating ? Math.max(1, d) : 0
    }
    return id
  }

  function clearTimer(id) {
    delete state.timers[id]
  }

  function requestAnimationFrame(callback) {
    if (typeof callback !== 'function') throw new TypeError('naddle clock: callback must be a function')
    var id = state.nextRafId++
    state.raf[id] = callback
    return id
  }

  function cancelAnimationFrame(id) {
    delete state.raf[id]
  }

  function flushRaf() {
    var entries = []
    for (var key in state.raf) {
      if (Object.prototype.hasOwnProperty.call(state.raf, key)) {
        entries.push([Number(key), state.raf[key]])
      }
    }
    state.raf = {}
    entries.sort(function (a, b) {
      return a[0] - b[0]
    })
    for (var i = 0; i < entries.length; i++) {
      entries[i][1](state.time)
    }
    return entries.length
  }

  function nextTimer(target) {
    var best = null
    for (var key in state.timers) {
      if (!Object.prototype.hasOwnProperty.call(state.timers, key)) continue
      var timer = state.timers[key]
      if (timer.at > target) continue
      if (best === null || timer.at < best.at || (timer.at === best.at && timer.id < best.id)) {
        best = timer
      }
    }
    return best
  }

  function advanceTo(target) {
    var value = Number(target)
    if (!isFinite(value)) throw new Error('naddle clock: target must be a finite number')
    if (value < state.time) {
      state.time = value
      return state.time
    }
    var callbacks = 0
    while (true) {
      var timer = nextTimer(value)
      if (timer === null) break
      state.time = timer.at
      if (timer.every > 0) {
        timer.at = timer.at + timer.every
      } else {
        delete state.timers[timer.id]
      }
      timer.fn.apply(null, timer.args)
      callbacks++
      if (callbacks > MAX_CALLBACKS) {
        throw new Error('naddle clock: too many timer callbacks before ' + value + 'ms')
      }
    }
    state.time = value
    return state.time
  }

  function advance(delta) {
    return advanceTo(state.time + Number(delta))
  }

  function seek(ms) {
    advanceTo(ms)
    flushRaf()
    return state.time
  }

  function install() {
    var performanceObject = global.performance
    if (performanceObject) {
      try {
        Object.defineProperty(performanceObject, 'now', {
          configurable: true,
          writable: true,
          value: now
        })
      } catch (error) {
        try {
          performanceObject.now = now
        } catch (ignored) {}
      }
    }
    try {
      global.Date.now = function () {
        return EPOCH + Math.floor(state.time)
      }
    } catch (error) {}
    try {
      global.Math.random = random
    } catch (error) {}
    global.requestAnimationFrame = requestAnimationFrame
    global.cancelAnimationFrame = cancelAnimationFrame
    global.setTimeout = function (fn, delay) {
      return schedule(fn, delay, arguments, false)
    }
    global.clearTimeout = clearTimer
    global.setInterval = function (fn, delay) {
      return schedule(fn, delay, arguments, true)
    }
    global.clearInterval = clearTimer
  }

  install()

  global.__naddleClock = {
    epoch: EPOCH,
    now: now,
    seek: seek,
    advance: advance,
    advanceTo: advanceTo,
    flushRaf: flushRaf,
    random: random,
    pendingTimers: function () {
      var count = 0
      for (var key in state.timers) {
        if (Object.prototype.hasOwnProperty.call(state.timers, key)) count++
      }
      return count
    },
    pendingRaf: function () {
      var count = 0
      for (var key in state.raf) {
        if (Object.prototype.hasOwnProperty.call(state.raf, key)) count++
      }
      return count
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
`
