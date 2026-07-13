import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Cross-process import guard (Phase 10 Step 6b). The renderer (src/ui + every
// *.client.ts) and the main process (every *.main.ts + src/core, except the
// preload bridge) share only the pure channel registry + *.types.ts. This test
// fails fast if a *.main.ts leaks into the renderer bundle (dragging ipcMain/node
// in) or a *.client.ts / `window` leaks into main — the kind of mistake the
// bundler would otherwise only surface as a confusing runtime crash.

const SRC = resolve(__dirname, '../../../..', 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

// Every import/re-export/side-effect specifier string in a file.
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const out: string[] = []
  const re = /(?:from|import)\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1])
  return out
}

const isMainModule = (spec: string): boolean => /\.main(\.ts)?$/.test(spec)
const isClientModule = (spec: string): boolean => /\.client(\.ts)?$/.test(spec)
const isElectron = (spec: string): boolean => spec === 'electron' || spec.startsWith('electron/')

const allTs = walk(SRC)
const rel = (f: string): string => f.slice(SRC.length + 1)

// Renderer-side files: everything under src/ui, plus the renderer IPC wrappers.
const rendererFiles = allTs.filter(
  (f) => rel(f).startsWith('ui/') || /\.client\.ts$/.test(f)
)

// Main-side files: every *.main.ts plus all of src/core EXCEPT the preload bridge
// (core/bridge runs in the renderer world and legitimately uses ipcRenderer).
const mainFiles = allTs.filter(
  (f) =>
    (/\.main\.ts$/.test(f) || rel(f).startsWith('core/')) &&
    !rel(f).startsWith('core/bridge/')
)

describe('cross-process import guard', () => {
  it('no renderer file imports a *.main module or electron', () => {
    const offenders: string[] = []
    for (const f of rendererFiles) {
      for (const spec of specifiers(f)) {
        if (isMainModule(spec)) offenders.push(`${rel(f)} → ${spec} (main module in renderer)`)
        if (isElectron(spec)) offenders.push(`${rel(f)} → ${spec} (electron in renderer)`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('no main-side file imports a *.client module or touches window.crafterm', () => {
    const offenders: string[] = []
    for (const f of mainFiles) {
      for (const spec of specifiers(f)) {
        if (isClientModule(spec)) offenders.push(`${rel(f)} → ${spec} (client module in main)`)
      }
      if (/window\.crafterm/.test(readFileSync(f, 'utf8'))) {
        offenders.push(`${rel(f)} references window.crafterm in main`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('the channel registry stays pure (no electron, no DOM/window)', () => {
    const registry = join(SRC, 'services/channels.ts')
    const text = readFileSync(registry, 'utf8')
    expect(specifiers(registry).some(isElectron), 'channels.ts must not import electron').toBe(false)
    expect(/\bwindow\./.test(text), 'channels.ts must not touch window').toBe(false)
    expect(/\bdocument\./.test(text), 'channels.ts must not touch document').toBe(false)
  })
})
