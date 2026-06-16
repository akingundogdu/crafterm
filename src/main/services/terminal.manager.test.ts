import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture the onData/onExit callbacks node-pty would invoke, plus spies for the
// process control methods, so we can assert the manager's bookkeeping.
interface FakePty {
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  pid: number
  emitExit: () => void
}

const spawned: FakePty[] = []

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const exitCbs: Array<() => void> = []
    const p: FakePty = {
      onData: vi.fn(),
      onExit: vi.fn((cb: () => void) => {
        exitCbs.push(cb)
      }),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      pid: 1234,
      emitExit: () => exitCbs.forEach((cb) => cb())
    }
    spawned.push(p)
    return p
  })
}))

import * as terminal from './terminal.manager'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWc = any

function fakeSender(): { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean } {
  return { send: vi.fn(), isDestroyed: () => false }
}

// Track the panes a test opens so afterEach can clear the manager's module-level
// registry — otherwise leftover ptys leak into the drain test and hang it.
const opened: string[] = []
function mk(sender = fakeSender()): { id: string; sender: ReturnType<typeof fakeSender> } {
  const id = terminal.create(sender as AnyWc, {})
  opened.push(id)
  return { id, sender }
}

beforeEach(() => {
  spawned.length = 0
})

afterEach(() => {
  for (const id of opened.splice(0)) terminal.kill(id)
})

describe('terminal.manager bookkeeping', () => {
  it('create registers the pane and routes output to its owning window', () => {
    const { id, sender } = mk()
    expect(terminal.has(id)).toBe(true)
    expect(terminal.get(id)).toBe(spawned[spawned.length - 1] as unknown)

    terminal.sendToOwner(id, 'pty:data', { id, data: 'hi' })
    expect(sender.send).toHaveBeenCalledWith('pty:data', { id, data: 'hi' })
  })

  it('write/resize delegate to the underlying pty', () => {
    const { id } = mk()
    const p = spawned[spawned.length - 1]

    terminal.write(id, 'ls\n')
    expect(p.write).toHaveBeenCalledWith('ls\n')

    terminal.resize(id, 120, 40)
    expect(p.resize).toHaveBeenCalledWith(120, 40)
  })

  it('kill stops the pty and drops it from the registry', () => {
    const { id } = mk()
    const p = spawned[spawned.length - 1]

    terminal.kill(id)
    expect(p.kill).toHaveBeenCalled()
    expect(terminal.has(id)).toBe(false)
    expect(terminal.get(id)).toBeUndefined()
  })

  it('a pty exiting on its own removes it from the registry', () => {
    const { id } = mk()
    const p = spawned[spawned.length - 1]

    expect(terminal.has(id)).toBe(true)
    p.emitExit()
    expect(terminal.has(id)).toBe(false)
  })

  it('adopt re-points an existing pane to a new owner; unknown ids are ignored', () => {
    const { id, sender: owner1 } = mk()

    const owner2 = fakeSender()
    terminal.adopt(id, owner2 as AnyWc)
    terminal.sendToOwner(id, 'pty:data', { id, data: 'x' })
    expect(owner2.send).toHaveBeenCalledWith('pty:data', { id, data: 'x' })
    expect(owner1.send).not.toHaveBeenCalled()

    const owner3 = fakeSender()
    terminal.adopt('does-not-exist', owner3 as AnyWc)
    expect(terminal.has('does-not-exist')).toBe(false)
  })

  it('sendToOwner falls back to the main window when no owner is registered', () => {
    const mainWc = { send: vi.fn(), isDestroyed: () => false }
    const mainWindow = { isDestroyed: () => false, webContents: mainWc }
    terminal.init({
      getMainWindow: () => mainWindow as AnyWc,
      isShellIntegrationReady: () => false,
      getZdotDir: () => ''
    })

    terminal.sendToOwner('orphan-id', 'pty:data', { id: 'orphan-id', data: 'y' })
    expect(mainWc.send).toHaveBeenCalledWith('pty:data', { id: 'orphan-id', data: 'y' })
  })

  it('drain resolves once every pty has exited', async () => {
    mk()
    const p = spawned[spawned.length - 1]

    const drained = terminal.drain()
    // drain calls kill() then awaits onExit; fire the exit it registered.
    expect(p.kill).toHaveBeenCalled()
    p.emitExit()
    await expect(drained).resolves.toBeUndefined()
  })
})
