import { join } from 'path'

// Resolved paths to the bundled preload script and renderer HTML entry points.
// `__dirname` is `out/main` at runtime (electron-vite bundles all main code into
// one file), so these resolve against the packaged `out/` layout. The HTML
// filenames double as the dev-server URL segments (used with ELECTRON_RENDERER_URL)
// — kept here so the packaged file path and the dev URL can't drift.

export const RENDERER_HTML = {
  index: 'index.html',
  popout: 'popout.html',
  improveWindow: 'improve-window.html'
} as const

export const preloadPath = (): string => join(__dirname, '../preload/index.js')

export const rendererHtmlPath = (page: keyof typeof RENDERER_HTML): string =>
  join(__dirname, '../renderer', RENDERER_HTML[page])
