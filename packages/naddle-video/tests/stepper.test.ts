import { describe, expect, it } from 'vitest'
import { VideoError } from '../src/errors'
import { stepFrames } from '../src/main/stepper'
import type { StageCapture, StageFrame } from '../src/types'

function frame(timestampMs: number): StageFrame {
  return {
    data: new Uint8Array(320 * 180 * 4),
    width: 320,
    height: 180,
    format: 'BGRA',
    timestampMs,
  }
}

function fakeStage(seeks: number[]): StageCapture {
  return {
    width: 320,
    height: 180,
    async seekFrame(ms: number) {
      seeks.push(ms)
      return frame(ms)
    },
    dispose() {},
  }
}

describe('stepFrames', () => {
  it('seeks every scheduled frame and reports progress in order', async () => {
    const seeks: number[] = []
    const received: Array<{ index: number; total: number; time: number }> = []
    const progress: Array<[number, number]> = []
    const result = await stepFrames(fakeStage(seeks), {
      fps: 10,
      durationMs: 500,
      onFrame: (captured, index, total) => {
        received.push({ index, total, time: captured.timestampMs })
      },
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(result.frameCount).toBe(5)
    expect(seeks).toEqual([0, 100, 200, 300, 400])
    expect(received).toEqual([
      { index: 0, total: 5, time: 0 },
      { index: 1, total: 5, time: 100 },
      { index: 2, total: 5, time: 200 },
      { index: 3, total: 5, time: 300 },
      { index: 4, total: 5, time: 400 },
    ])
    expect(progress).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
  })

  it('stops before the first capture when already canceled', async () => {
    const seeks: number[] = []
    const controller = new AbortController()
    controller.abort()
    try {
      await stepFrames(fakeStage(seeks), {
        fps: 10,
        durationMs: 500,
        signal: controller.signal,
        onFrame: () => {},
      })
      throw new Error('expected a canceled error')
    } catch (error) {
      expect(error).toBeInstanceOf(VideoError)
      expect((error as VideoError).code).toBe('canceled')
    }
    expect(seeks).toEqual([])
  })

  it('stops mid-way when the signal fires during a frame', async () => {
    const seeks: number[] = []
    const controller = new AbortController()
    try {
      await stepFrames(fakeStage(seeks), {
        fps: 10,
        durationMs: 500,
        signal: controller.signal,
        onFrame: (_captured, index) => {
          if (index === 1) controller.abort()
        },
      })
      throw new Error('expected a canceled error')
    } catch (error) {
      expect((error as VideoError).code).toBe('canceled')
    }
    expect(seeks).toEqual([0, 100])
  })
})
