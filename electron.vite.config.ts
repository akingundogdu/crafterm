import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

// geaPlugin enforces gea's component rules (no named JSX exports, one component
// per file) on EVERY JSX file it transforms — which would break the legacy
// renderer wholesale. To migrate incrementally we gate its `transform` hook to
// the new gea tree (`src/views/**`); legacy `src/ui` files return null and fall
// through to esbuild's custom `@ui` JSX runtime. All other gea hooks (virtual
// modules, config) still run globally, which is what they need.
function scopedGeaPlugin(): Plugin {
  const base = geaPlugin()
  const origTransform = base.transform as (
    this: unknown,
    code: string,
    id: string
  ) => unknown
  return {
    ...base,
    transform(code: string, id: string) {
      const file = id.split('?')[0].replace(/\\/g, '/')
      if (!file.includes('/src/views/')) return null
      return origTransform.call(this, code, id)
    }
  } as Plugin
}

// Shared path aliases (mirror tsconfig paths) — kill ../../../ chains as the
// Phase 10 MVC layout (src/core, src/services, src/ui, …) lands incrementally.
const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@configs': resolve(__dirname, 'src/configs'),
  '@models': resolve(__dirname, 'src/models'),
  '@repositories': resolve(__dirname, 'src/repositories'),
  '@texts': resolve(__dirname, 'src/ui-texts/ui-texts.ts'),
  '@services': resolve(__dirname, 'src/services'),
  '@ui': resolve(__dirname, 'src/ui'),
  // New gea renderer tree (co-exists with the legacy @ui tree during migration;
  // @ui is deleted once @views is complete).
  '@views': resolve(__dirname, 'src/views'),
  '@resources': resolve(__dirname, 'src/resources'),
  '@tests': resolve(__dirname, 'src/tests')
}

export default defineConfig({
  main: {
    // externalize node-pty so the native module is NOT bundled into the main process
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/core/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/core/bridge/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/views'),
    // Co-existence: gea compiles only `*.gea.*` files; legacy files are left to
    // esbuild's custom `@ui` JSX runtime below (see scopedGeaPlugin).
    plugins: [scopedGeaPlugin()],
    resolve: { alias },
    esbuild: { jsx: 'automatic', jsxImportSource: '@ui' },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/views/index.html'),
          popout: resolve(__dirname, 'src/views/popout/popout.html'),
          improveWindow: resolve(__dirname, 'src/views/improveWindow/improve-window.html')
        }
      }
    }
  }
})
