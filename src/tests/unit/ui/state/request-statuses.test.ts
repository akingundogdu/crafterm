// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { hooks, requestStatuses } from '@views/state/spine'

const after = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// A due request runs on setTimeout → rAF, so one short wait covers both hops.
const DUE = 80
// Comfortably past STATUS_MIN_INTERVAL_MS (300) in state.ts.
const WINDOW = 400

// The throttle keeps module-level timing state, so let any pending run from an
// earlier test land BEFORE zeroing the counter this test asserts on.
const settle = async (count: () => void): Promise<void> => {
  hooks.updateStatuses = count
  await after(WINDOW)
}

describe('requestStatuses', () => {
  it('collapses an output burst into one reconcile per window', async () => {
    let runs = 0
    await settle(() => {
      runs++
    })
    runs = 0

    // markBusy() calls this for every PTY data chunk — a streaming pane can ask
    // dozens of times per frame. All of them must share one reconcile.
    for (let i = 0; i < 50; i++) requestStatuses()
    await after(DUE)
    expect(runs).toBe(1)

    // A second burst inside the same window adds no extra reconcile.
    for (let i = 0; i < 50; i++) requestStatuses()
    await after(DUE)
    expect(runs).toBe(1)

    // …but it is not dropped: the queued request lands once the window elapses, so
    // the final status is never lost.
    await after(WINDOW)
    expect(runs).toBe(2)
  })

  it('defers the first request instead of running it inline', async () => {
    let runs = 0
    await settle(() => {
      runs++
    })
    runs = 0

    requestStatuses()
    expect(runs).toBe(0) // callers keep mutating state after asking — never synchronous

    await after(DUE)
    expect(runs).toBe(1)
  })
})
