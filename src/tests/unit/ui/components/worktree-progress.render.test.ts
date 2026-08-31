// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The overlay must REPAINT as steps report in — the store holding the right value
// is not enough. This mounts the real component and drives it the way the OSC
// markers do.

const overlayEl = document.createElement('div')
vi.mock('@views/components/overlay/overlay', () => ({
  createOverlay: () => ({
    overlay: overlayEl,
    mount: () => {},
    onClose: () => {},
    close: () => {}
  })
}))

const { showWorktreeProgress } = await import('@views/components/worktree-progress/worktree-progress')

const STEPS = [
  { id: 'looking', label: 'Looking' },
  { id: 'pre:a', label: 'Install' },
  { id: 'creating', label: 'Creating' }
]

const tick = () => new Promise((r) => setTimeout(r, 20))
const rowClass = (label: string): string =>
  [...overlayEl.querySelectorAll('.worktree-progress-step')]
    .find((el) => el.textContent?.includes(label))
    ?.className ?? ''

describe('worktree progress — repaint on step reports', () => {
  beforeEach(() => {
    overlayEl.innerHTML = ''
  })

  it('paints a step running and then done as it reports', async () => {
    const progress = showWorktreeProgress('Creating worktree x', STEPS)
    await tick()
    expect(rowClass('Install')).toContain('pending')

    progress.markStep('pre:a', 'active')
    await tick()
    expect(rowClass('Install')).toContain('active')
    expect(rowClass('Looking')).toContain('done')

    progress.markStep('pre:a', 'done')
    await tick()
    expect(rowClass('Install')).toContain('done')
  })

  it('paints a failed step', async () => {
    const progress = showWorktreeProgress('Creating worktree x', STEPS)
    await tick()

    progress.markStep('pre:a', 'failed')
    await tick()

    expect(rowClass('Install')).toContain('failed')
  })
})
