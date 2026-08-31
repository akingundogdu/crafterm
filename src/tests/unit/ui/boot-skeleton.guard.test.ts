import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The boot skeleton covers the window while the renderer module loads. Its whole
// point is to be painted BEFORE that module runs: every other stylesheet is
// imported by the entry, so the static shell in index.html used to flash
// unstyled until the bundle arrived. That only holds while the wiring below
// stays intact — a stylesheet moved into the entry's imports, a renamed class,
// or a dropped reveal call each silently bring the flash back.

const VIEWS = join(process.cwd(), 'src', 'views')
const html = readFileSync(join(VIEWS, 'index.html'), 'utf8')
const css = readFileSync(join(VIEWS, 'app-shell', 'boot-skeleton.css'), 'utf8')
const entry = readFileSync(join(VIEWS, 'main', 'main.ts'), 'utf8')
const store = readFileSync(join(VIEWS, 'main', 'main.store.ts'), 'utf8')

describe('boot skeleton', () => {
  it('is styled by a linked stylesheet, not one imported by the entry module', () => {
    expect(html).toMatch(/<link[^>]+href="\.\/app-shell\/boot-skeleton\.css"/)
    expect(entry).not.toMatch(/import\s+'[^']*boot-skeleton\.css'/)
  })

  it('renders the skeleton markup ahead of the app shell', () => {
    const skeleton = html.indexOf('id="boot-skeleton"')
    const app = html.indexOf('id="app"')
    expect(skeleton).toBeGreaterThan(-1)
    expect(app).toBeGreaterThan(skeleton)
  })

  it('defines every skeleton class the markup uses', () => {
    const used = new Set<string>()
    for (const m of html.matchAll(/class="([^"]*boot-skeleton[^"]*)"/g)) {
      for (const cls of m[1].split(/\s+/)) if (cls) used.add(cls)
    }
    expect(used.size).toBeGreaterThan(0)

    const defined = new Set<string>()
    for (const m of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) defined.add(m[1])
    expect([...used].filter((cls) => !defined.has(cls)).sort()).toEqual([])
  })

  it('hides the app shell until app-ready lands, with a failsafe reveal', () => {
    expect(css).toMatch(/#app\s*\{[^}]*visibility:\s*hidden/)
    expect(css).toMatch(/body\.app-ready\s+#app\s*\{[^}]*visibility:\s*visible/)
    expect(css).toMatch(/body\.app-ready\s+#boot-skeleton\s*\{[^}]*display:\s*none/)
    // Without the timed keyframes a renderer that never boots would leave the
    // skeleton on screen forever.
    expect(css).toMatch(/@keyframes boot-skeleton-failsafe-shell/)
    expect(css).toMatch(/@keyframes boot-skeleton-failsafe-hide/)
  })

  it('reveals the shell from the entry on a fixed 3s boot delay', () => {
    expect(entry).toMatch(/revealAppShell\(\)/)
    expect(store).toMatch(/const BOOT_SKELETON_MS = 3000/)
    expect(store).toMatch(/classList\.add\('app-ready'\)/)
    // Counted from navigation start so a slow module load eats into the wait
    // instead of adding a second delay on top of it.
    expect(store).toMatch(/BOOT_SKELETON_MS - performance\.now\(\)/)
  })
})
