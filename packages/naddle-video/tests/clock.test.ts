import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { CLOCK_RUNTIME_SCRIPT } from '../src/runtime/clock'

interface ClockContext {
  __naddleClock: {
    epoch: number
    now(): number
    seek(ms: number): number
    advance(ms: number): number
    advanceTo(ms: number): number
    flushRaf(): number
    random(): number
    pendingTimers(): number
    pendingRaf(): number
  }
  performance: { now(): number }
  Date: { now(): number }
  Math: { random(): number }
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(id: number): void
  setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): number
  clearTimeout(id: number): void
  setInterval(callback: (...args: unknown[]) => void, delay?: number): number
  clearInterval(id: number): void
}

function loadClock(): ClockContext {
  const sandbox = vm.createContext({
    performance: { now: () => 0 },
    console,
  }) as unknown as ClockContext
  // expose the context's own Date and Math so the test reads the same
  // intrinsics the injected script overrides
  sandbox.Date = vm.runInContext('Date', sandbox as unknown as vm.Context)
  sandbox.Math = vm.runInContext('Math', sandbox as unknown as vm.Context)
  vm.runInContext(CLOCK_RUNTIME_SCRIPT, sandbox as unknown as vm.Context)
  return sandbox
}

function runSequence(context: ClockContext): unknown[] {
  const output: unknown[] = []
  const clock = context.__naddleClock
  context.requestAnimationFrame((time) => {
    output.push([
      'raf-a',
      time,
      context.performance.now(),
      context.Date.now(),
      context.Math.random(),
    ])
  })
  context.setTimeout(() => {
    output.push(['timeout-16', clock.now(), context.Math.random()])
  }, 16)
  const interval = context.setInterval(() => {
    output.push(['interval-10', clock.now(), context.Math.random()])
  }, 10)
  clock.seek(0)
  clock.seek(50)
  context.clearInterval(interval)
  context.requestAnimationFrame((time) => {
    output.push(['raf-b', time, context.Math.random()])
  })
  clock.seek(100)
  clock.flushRaf()
  context.requestAnimationFrame(() => {
    output.push(['raf-c', clock.now(), context.Math.random()])
  })
  clock.seek(250)
  output.push(['final', clock.now(), context.performance.now(), context.Date.now()])
  return output
}

describe('virtual clock', () => {
  it('is deterministic across two runs', () => {
    const first = runSequence(loadClock())
    const second = runSequence(loadClock())
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(8)
  })

  it('advances rAF, timers and Date.now on virtual time', () => {
    const context = loadClock()
    const clock = context.__naddleClock
    const seen: number[] = []
    context.setTimeout(() => seen.push(clock.now()), 25)
    context.setInterval(() => seen.push(clock.now()), 10)
    context.requestAnimationFrame((time) => seen.push(time))
    expect(clock.seek(0)).toBe(0)
    expect(seen).toEqual([0])
    clock.advanceTo(30)
    expect(seen).toEqual([0, 10, 20, 25, 30])
    expect(context.performance.now()).toBe(30)
    expect(context.Date.now()).toBe(clock.epoch + 30)
  })

  it('flushes only the callbacks queued for the current frame', () => {
    const context = loadClock()
    const clock = context.__naddleClock
    const seen: string[] = []
    context.requestAnimationFrame(() => {
      seen.push('first')
      context.requestAnimationFrame(() => seen.push('second'))
    })
    expect(clock.pendingRaf()).toBe(1)
    expect(clock.flushRaf()).toBe(1)
    expect(seen).toEqual(['first'])
    expect(clock.flushRaf()).toBe(1)
    expect(seen).toEqual(['first', 'second'])
  })

  it('seeks backwards without replaying timers', () => {
    const context = loadClock()
    const clock = context.__naddleClock
    const seen: number[] = []
    context.setTimeout(() => seen.push(50), 50)
    clock.seek(100)
    expect(seen).toEqual([50])
    clock.seek(10)
    expect(clock.now()).toBe(10)
    expect(seen).toEqual([50])
    clock.seek(100)
    expect(seen).toEqual([50])
  })

  it('uses a fixed seeded random sequence', () => {
    const first = loadClock()
    const second = loadClock()
    const values = Array.from({ length: 5 }, () => first.__naddleClock.random())
    const repeats = Array.from({ length: 5 }, () => second.__naddleClock.random())
    expect(values).toEqual(repeats)
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
