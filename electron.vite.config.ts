import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { geaPlugin } from '@geajs/vite-plugin'

// Shared path aliases (mirror tsconfig paths) — kill ../../../ chains as the
// Phase 10 MVC layout (src/core, src/services, src/ui, …) lands incrementally.
const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@configs': resolve(__dirname, 'src/configs'),
  '@models': resolve(__dirname, 'src/models'),
  '@repositories': resolve(__dirname, 'src/repositories'),
  '@texts': resolve(__dirname, 'src/ui-texts/ui-texts.ts'),
  '@services': resolve(__dirname, 'src/services'),
  // gea renderer tree (the sole renderer tree after the @ui teardown).
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
    // The renderer is now uniformly gea: geaPlugin transforms every JSX file in
    // src/views; shared non-JSX TS (@services/@repositories/@models) passes through.
    plugins: [geaPlugin()],
    resolve: { alias },
    esbuild: { jsx: 'automatic', jsxImportSource: '@views' },
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
