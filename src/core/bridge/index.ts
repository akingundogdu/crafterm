import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

// The renderer (web) can only reach the shell through this narrow, generic
// bridge: a pass-through over the channel registry (see services/channels.ts).
// The renderer's services/<domain>/<domain>.client.ts wrappers are the only
// callers; each supplies the channel string + a payload typed by the registry,
// so the bridge itself stays untyped and stable while the contract lives in one
// place. `on` returns an unsubscribe.
contextBridge.exposeInMainWorld('crafterm', {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  send: (channel: string, payload?: unknown) => ipcRenderer.send(channel, payload),
  on: (channel: string, cb: (payload: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
})
