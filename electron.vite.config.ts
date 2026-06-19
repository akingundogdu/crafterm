import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Shared path aliases (mirror tsconfig paths) — kill ../../../ chains as the
// Phase 10 MVC layout (src/core, src/services, src/ui, …) lands incrementally.
const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@services': resolve(__dirname, 'src/services'),
  '@ui': resolve(__dirname, 'src/ui'),
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
    root: resolve(__dirname, 'src/ui'),
    resolve: { alias },
    esbuild: { jsx: 'automatic', jsxImportSource: '@ui' },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/ui/index.html'),
          popout: resolve(__dirname, 'src/ui/popout.html'),
          improveWindow: resolve(__dirname, 'src/ui/improve-window.html')
        }
      }
    }
  }
})
