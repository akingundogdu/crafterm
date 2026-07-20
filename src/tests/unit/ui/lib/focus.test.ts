// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { focusWhenReady } from '@views/lib/focus'

const nextFrames = (n = 3): Promise<void> =>
  new Promise((resolve) => {
    let left = n
    const tick = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  })

describe('focusWhenReady', () => {
  beforeEach(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    document.body.replaceChildren()
  })

  it('focuses an element that only appears on a later frame (gea renders async)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    focusWhenReady(() => host.querySelector<HTMLTextAreaElement>('textarea'))

    const area = document.createElement('textarea')
    host.appendChild(area)
    await nextFrames()

    expect(document.activeElement).toBe(area)
  })

  it('selects the existing text when asked (so typing replaces it)', async () => {
    const input = document.createElement('input')
    input.value = 'draft'
    document.body.appendChild(input)

    focusWhenReady(() => input, true)
    await nextFrames()

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('draft'.length)
  })

  it('gives up quietly when the element never shows up', async () => {
    focusWhenReady(() => null)
    await nextFrames(25)

    expect(document.activeElement).toBe(document.body)
  })
})
