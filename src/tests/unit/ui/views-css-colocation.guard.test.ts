import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// HARD RULE (§views): a component's CSS is co-located with the component. If a
// `<name>.tsx` styles DOM with its OWN class prefix (`.<name>`, `.<name>-*`), those
// rules belong in a sibling `<name>.css` that the view imports — NOT in the screen's
// catch-all stylesheet. Global/shell CSS stays in `styles/` and `app-shell/`.
//
// This guard is a RATCHET, like the gea-component one: the frozen set of components
// whose own-prefixed classes still live in someone else's stylesheet is
// GRANDFATHERED. A NEW violator fails the guard; so does a component that was fixed
// but left on the list. The convention is fully honoured when the list is empty.
const VIEWS = join(process.cwd(), 'src', 'views')

// Empty: every component now owns its CSS. This list exists only so a future
// violation can be temporarily parked here — but the guard fails on any NEW entry,
// so it should stay empty.
const GRANDFATHERED: string[] = []

function collectTsx(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) collectTsx(path, acc)
    else if (entry.name.endsWith('.tsx')) acc.push(path)
  }
}

// Every class name the view puts in the DOM, from `class="a b"` / `class={'a b' + …}`.
function classesIn(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/class=(?:"([^"]*)"|\{\s*'([^']*)'|\{\s*"([^"]*)")/g)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? ''
    out.push(...literal.split(/\s+/).filter(Boolean))
  }
  return out
}

function rel(path: string): string {
  return path.slice(VIEWS.length).replace(/^[/\\]/, '').split('\\').join('/')
}

describe('views CSS co-location guard', () => {
  it('a component styling its own class prefix owns a co-located <name>.css', () => {
    const files: string[] = []
    collectTsx(VIEWS, files)

    const offenders = files
      .filter((file) => {
        const name = file.slice(file.lastIndexOf('/') + 1, -4)
        const source = readFileSync(file, 'utf8')
        const ownsClasses = classesIn(source).some((c) => c === name || c.startsWith(name + '-'))
        if (!ownsClasses) return false
        const css = file.slice(0, -4) + '.css'
        const importsCss = source.includes(`import './${name}.css'`)
        return !(existsSync(css) && importsCss)
      })
      .map(rel)
      .sort()

    const unexpected = offenders.filter((f) => !GRANDFATHERED.includes(f))
    const fixed = GRANDFATHERED.filter((f) => !offenders.includes(f))

    expect(
      unexpected,
      `these components style their own classes from a foreign stylesheet — give each a co-located <name>.css: ${unexpected.join(', ')}`
    ).toEqual([])
    expect(fixed, `now co-located — drop from GRANDFATHERED: ${fixed.join(', ')}`).toEqual([])
  })
})
