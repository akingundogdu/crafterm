// Electron / Node event-name literals, centralized so registrations reference one
// source instead of inline strings. Grouped by the emitter the event is used on.
export const Events = {
  App: {
    Activate: 'activate',
    BeforeQuit: 'before-quit',
    WindowAllClosed: 'window-all-closed',
    WebContentsCreated: 'web-contents-created'
  },
  Window: {
    ReadyToShow: 'ready-to-show',
    EnterFullScreen: 'enter-full-screen',
    LeaveFullScreen: 'leave-full-screen',
    Close: 'close',
    Closed: 'closed'
  },
  WebContents: {
    DidFinishLoad: 'did-finish-load',
    BeforeInputEvent: 'before-input-event'
  },
  Notification: {
    Click: 'click'
  },
  Process: {
    UncaughtException: 'uncaughtException'
  },
  Watcher: {
    Error: 'error'
  }
} as const
