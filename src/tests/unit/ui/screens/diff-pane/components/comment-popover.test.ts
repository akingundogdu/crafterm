// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createCommentPopover, type CommentRange } from '@ui/screens/diff-pane/components/comment-popover'

afterEach(() => {
  document.body.innerHTML = ''
})

const range: CommentRange = { path: 'src/a.ts', a: 10, b: 12 }

const mount = (over: Partial<Parameters<typeof createCommentPopover>[0]> = {}) => {
  const submit = vi.fn(async () => ({ ok: true }))
  const onSuccess = vi.fn()
  const pop = createCommentPopover({
    anchorRect: () => new DOMRect(0, 0, 10, 10),
    getRange: () => range,
    submit,
    onSuccess,
    ...over
  })
  return { pop, submit, onSuccess }
}
const el = () => document.querySelector<HTMLElement>('.diff-comment-pop')
const ta = () => document.querySelector<HTMLTextAreaElement>('.diff-comment-input')!
const sendBtn = () => document.querySelector<HTMLButtonElement>('.diff-comment-send')!
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createCommentPopover', () => {
  it('opens with a range label and the comment form', () => {
    const { pop } = mount()
    pop.open()
    expect(pop.isOpen()).toBe(true)
    expect(document.querySelector('.diff-comment-label')?.textContent).toBe(
      'Comment on src/a.ts · lines 10-12'
    )
    expect(ta()).toBeTruthy()
  })

  it('labels a single-line range without a dash', () => {
    const { pop } = mount({ getRange: () => ({ path: 'x.ts', a: 5, b: 5 }) })
    pop.open()
    expect(document.querySelector('.diff-comment-label')?.textContent).toBe('Comment on x.ts · line 5')
  })

  it('does not open when there is no range', () => {
    const { pop } = mount({ getRange: () => null })
    pop.open()
    expect(pop.isOpen()).toBe(false)
  })

  it('ignores submit with empty text', async () => {
    const { pop, submit } = mount()
    pop.open()
    sendBtn().click()
    await flush()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits text, fires onSuccess, and closes on success', async () => {
    const { pop, submit, onSuccess } = mount()
    pop.open()
    ta().value = 'looks good'
    sendBtn().click()
    await flush()
    expect(submit).toHaveBeenCalledWith(range, 'looks good')
    expect(onSuccess).toHaveBeenCalledWith(range)
    expect(pop.isOpen()).toBe(false)
  })

  it('shows the error and re-enables on failure', async () => {
    const { pop, onSuccess } = mount({ submit: vi.fn(async () => ({ ok: false, error: 'nope' })) })
    pop.open()
    ta().value = 'x'
    sendBtn().click()
    await flush()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(document.querySelector('.diff-comment-err')?.textContent).toBe('nope')
    expect(sendBtn().disabled).toBe(false)
    expect(pop.isOpen()).toBe(true)
  })

  it('Cmd+Enter submits and Escape closes', async () => {
    const { pop, submit } = mount()
    pop.open()
    ta().value = 'via shortcut'
    ta().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    await flush()
    expect(submit).toHaveBeenCalledWith(range, 'via shortcut')

    const { pop: pop2 } = mount()
    pop2.open()
    ta().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(pop2.isOpen()).toBe(false)
  })
})
