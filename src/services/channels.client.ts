import type { ReqOf, ResOf, PayloadOf, RpcChannel, MsgChannel, EvtChannel } from './channels'

// Re-export the channel-name namespace so renderer wrappers import their helpers
// and the channel constants from one place.
export { Channel } from './channels'

// RENDERER-side typed IPC wrappers, generic over the channel registry. The
// `*.client.ts` domain wrappers call through these instead of touching
// `window.crafterm` with raw channel strings, so request/response types are
// checked against channels.ts and can't drift from the main-side handlers.
//
// The preload (core/bridge) exposes a generic `{ invoke, send, on }` passthrough
// on `window.crafterm`; these helpers are the only callers of it.

// The generic preload bridge surface exposed on window.crafterm.
export interface CraftermBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  send(channel: string, payload?: unknown): void
  on(channel: string, cb: (payload: unknown) => void): () => void
  // Not IPC: resolves a dropped File to its absolute path in the renderer (a
  // File cannot be serialized across a channel). See core/bridge.
  pathForFile(file: File): string
}

declare global {
  interface Window {
    crafterm: CraftermBridge
  }
}

// Request/response: await a reply. Channels whose request is `void` take no payload.
export function call<C extends RpcChannel>(
  channel: C,
  ...args: ReqOf<C> extends void ? [] : [req: ReqOf<C>]
): Promise<ResOf<C>> {
  return window.crafterm.invoke(channel, args[0]) as Promise<ResOf<C>>
}

// Fire-and-forget renderer→main message.
export function send<C extends MsgChannel>(
  channel: C,
  ...args: ReqOf<C> extends void ? [] : [req: ReqOf<C>]
): void {
  window.crafterm.send(channel, args[0])
}

// Subscribe to a main→renderer push; returns an unsubscribe function.
export function listen<C extends EvtChannel>(
  channel: C,
  cb: (payload: PayloadOf<C>) => void
): () => void {
  return window.crafterm.on(channel, (p) => cb(p as PayloadOf<C>))
}

// Absolute path of a dropped File (renderer-only; not an IPC channel).
export function pathForFile(file: File): string {
  return window.crafterm.pathForFile(file)
}
