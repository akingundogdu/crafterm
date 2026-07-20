import { describe, it, expect, beforeEach, vi } from 'vitest'

// A renderer window carries the preload bridge, so it must never navigate to — or open —
// content we don't control, and a <webview> it attaches must stay Node-free.

const openExternal = vi.fn()
vi.mock('electron', () => ({ shell: { openExternal: (u: string) => openExternal(u) } }))

const { hardenWindow } = await import('@core/windows/window-security')

type Handler = (...args: unknown[]) => void

// Minimal WebContents stand-in that records what hardenWindow registers.
function fakeWebContents() {
  const listeners = new Map<string, Handler>()
  let openHandler: ((d: { url: string }) => { action: string }) | null = null
  return {
    on: (event: string, fn: Handler) => listeners.set(event, fn),
    setWindowOpenHandler: (fn: (d: { url: string }) => { action: string }) => {
      openHandler = fn
    },
    emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(...args),
    openWindow: (url: string) => openHandler?.({ url }),
    has: (event: string) => listeners.has(event)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const harden = (wc: ReturnType<typeof fakeWebContents>) => hardenWindow(wc as any)

describe('hardenWindow', () => {
  beforeEach(() => {
    openExternal.mockReset()
    delete process.env.ELECTRON_RENDERER_URL
  })

  it('denies window.open and sends the URL to the real browser instead', () => {
    const wc = fakeWebContents()
    harden(wc)

    expect(wc.openWindow('https://example.dev')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.dev')
  })

  it('does not hand a non-web scheme to the OS', () => {
    const wc = fakeWebContents()
    harden(wc)

    expect(wc.openWindow('file:///etc/passwd')).toEqual({ action: 'deny' })
    expect(wc.openWindow('javascript:alert(1)')).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('blocks navigating the bridged window to a remote origin', () => {
    const wc = fakeWebContents()
    harden(wc)
    const e = { preventDefault: vi.fn() }

    wc.emit('will-navigate', e, 'https://evil.dev')

    expect(e.preventDefault).toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith('https://evil.dev')
  })

  it('allows the app to navigate within its own bundle', () => {
    const wc = fakeWebContents()
    harden(wc)
    const e = { preventDefault: vi.fn() }

    wc.emit('will-navigate', e, 'file:///Applications/Crafterm.app/out/renderer/index.html')

    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('allows the dev server origin when one is set', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    const wc = fakeWebContents()
    harden(wc)
    const e = { preventDefault: vi.fn() }

    wc.emit('will-navigate', e, 'http://localhost:5173/index.html')

    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('strips preload and Node from any attached webview', () => {
    const wc = fakeWebContents()
    harden(wc)
    const prefs = { preload: '/path/to/preload.js', nodeIntegration: true, contextIsolation: false }

    wc.emit('will-attach-webview', {}, prefs)

    expect(prefs.preload).toBeUndefined()
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.contextIsolation).toBe(true)
  })

  it('denies popups opened from inside a browser pane', () => {
    const wc = fakeWebContents()
    harden(wc)
    const guest = fakeWebContents()

    wc.emit('did-attach-webview', {}, guest)

    expect(guest.openWindow('https://popup.dev')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://popup.dev')
  })
})
