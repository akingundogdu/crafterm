import { describe, it, expect, beforeEach } from 'vitest'
import store, { CREATE_STEPS } from '@views/components/worktree-progress/worktree-progress.store'

// The creation overlay lists the user's setup scripts as rows of their own, and
// those rows are driven by what the shell reports back — not by a positional
// cursor. A script only reads as done once it has actually exited.
const STEPS = [
  CREATE_STEPS[0],
  { id: 'pre:a', label: 'Install' },
  CREATE_STEPS[1],
  CREATE_STEPS[2],
  { id: 'post:b', label: 'Index', detail: 'codegraph init -i .' }
]

describe('worktree progress — self-reported steps', () => {
  beforeEach(() => {
    store.start('Creating worktree CRF-1', STEPS)
  })

  it('starts with the first row running and the rest pending', () => {
    expect(store.stateOf(0)).toBe('active')
    expect(store.stateOf(1)).toBe('pending')
    expect(store.stateOf(4)).toBe('pending')
  })

  it('flips a script to running, then to done, without touching its neighbours', () => {
    store.markStep('pre:a', 'active')

    expect(store.stateOf(1)).toBe('active')
    expect(store.stateOf(0)).toBe('done') // the stage before it advanced
    expect(store.stateOf(2)).toBe('pending')

    store.markStep('pre:a', 'done')

    expect(store.stateOf(1)).toBe('done')
    expect(store.stateOf(2)).toBe('pending')
  })

  it('marks a non-zero exit as failed while the rest keep their own state', () => {
    store.markStep('pre:a', 'failed')
    store.markStep('creating', 'active')

    expect(store.stateOf(1)).toBe('failed')
    expect(store.stateOf(2)).toBe('active')
  })

  it('keeps a reported outcome even after the cursor moves past it', () => {
    store.markStep('pre:a', 'failed')
    store.setStep('materializing')

    expect(store.stateOf(1)).toBe('failed')
  })

  it('resets the marks on the next run', () => {
    store.markStep('pre:a', 'failed')
    store.start('Creating worktree CRF-2', STEPS)

    expect(store.stateOf(1)).toBe('pending')
  })

  it('ignores a step id that is not on the list', () => {
    store.markStep('post:missing', 'active')

    expect(store.stateOf(0)).toBe('active')
  })
})
