import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import type { ChannelName, ReqOf, ResOf, PayloadOf, RpcChannel, MsgChannel, EvtChannel } from './channels'

// Re-export the channel-name namespace so main-side modules import their handlers
// and the channel constants from one place.
export { Channel } from './channels'

// MAIN-side typed IPC wrappers, generic over the channel registry. Each `*.main.ts`
// registers handlers through these instead of touching `ipcMain` with raw channel
// strings, so the request/response types are checked against channels.ts and can't
// drift from the renderer's `call`/`send`/`listen`.

// Request/response (invoke ↔ handle).
export function handle<C extends RpcChannel>(
  channel: C,
  handler: (req: ReqOf<C>, event: IpcMainInvokeEvent) => ResOf<C> | Promise<ResOf<C>>
): void {
  ipcMain.handle(channel, (event, payload) => handler(payload as ReqOf<C>, event))
}

// Renderer→main one-way (send ↔ on).
export function on<C extends MsgChannel>(
  channel: C,
  handler: (req: ReqOf<C>, event: IpcMainEvent) => void
): void {
  ipcMain.on(channel, (event, payload) => handler(payload as ReqOf<C>, event))
}

// Main→renderer push (webContents.send). Channels whose payload is `void` take no
// payload argument.
export function emit<C extends EvtChannel>(
  wc: WebContents,
  channel: C,
  ...args: PayloadOf<C> extends void ? [] : [payload: PayloadOf<C>]
): void {
  wc.send(channel, args[0])
}

// Escape hatch for the rare main-side caller that needs a channel name typed but
// already holds the electron primitive (e.g. terminal.manager's owner routing).
export type { ChannelName }
