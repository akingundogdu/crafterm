import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadScript } from '@core/services/scripts/scripts.service'

// Templates ship under src/resources/runtime/templates; in tests cwd is the repo root.
const TEMPLATES = join(process.cwd(), 'src', 'resources', 'runtime', 'templates')

// Replica of the main process's shq() (index.ts) so golden tests reproduce the
// exact pre-refactor command strings.
const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

describe('loadScript', () => {
  it('substitutes every token', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-'))
    writeFileSync(join(dir, 't.tmpl'), 'a {{x}} b {{y}} {{x}}')
    expect(loadScript(dir, 't.tmpl', { x: '1', y: '2' })).toBe('a 1 b 2 1')
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws on a missing template', () => {
    expect(() => loadScript(TEMPLATES, 'does-not-exist.tmpl', {})).toThrow()
  })

  it('throws when a placeholder is left unreplaced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-'))
    writeFileSync(join(dir, 't.tmpl'), 'a {{x}} {{missing}}')
    expect(() => loadScript(dir, 't.tmpl', { x: '1' })).toThrow(/missing/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('golden: self-update.sh.tmpl is byte-identical to the old inline steps', () => {
  it('matches the previous steps.join(" && ") for sample values', () => {
    const APP_NAME = 'Crafterm'
    const repo = '/Users/me/crafterm'
    const dest = `/Applications/${APP_NAME}.app`

    // The exact construction that lived in index.ts before Phase 3.
    const expected = [
      `for i in $(seq 1 60); do pgrep -x ${shq(APP_NAME)} >/dev/null || break; sleep 0.3; done`,
      `APP_PATH="$(find ${shq(join(repo, 'dist'))} -maxdepth 2 -name ${shq(APP_NAME + '.app')} -type d 2>/dev/null | head -1)"`,
      `[ -n "$APP_PATH" ] || { echo "built app not found under dist/"; exit 1; }`,
      `rm -rf ${shq(dest)}`,
      `cp -R "$APP_PATH" ${shq(dest)}`,
      `open ${shq(dest)}`
    ].join(' && ')

    const out = loadScript(TEMPLATES, 'self-update.sh.tmpl', {
      appName: shq(APP_NAME),
      distDir: shq(join(repo, 'dist')),
      appBundle: shq(APP_NAME + '.app'),
      dest: shq(dest)
    })
    expect(out).toBe(expected)
  })
})

describe('golden: zsh one-liners are byte-identical to their old inline forms', () => {
  it('ide-open.sh.tmpl matches `${cmd} ${shq(path)}`', () => {
    const cmd = 'code'
    const path = '/a/b c.md'
    expect(loadScript(TEMPLATES, 'ide-open.sh.tmpl', { cmd, path: shq(path) })).toBe(`${cmd} ${shq(path)}`)
  })

  it('deploy-run.sh.tmpl matches `${cmd} > ${shq(log)} 2>&1`', () => {
    const cmd = 'run-crafterm-deploy'
    const log = '/tmp/deploy.log'
    expect(loadScript(TEMPLATES, 'deploy-run.sh.tmpl', { cmd, log: shq(log) })).toBe(`${cmd} > ${shq(log)} 2>&1`)
  })

  it('markdown-open.sh.tmpl matches `markdown ${shq(path)}`', () => {
    const path = '/notes/plan.md'
    expect(loadScript(TEMPLATES, 'markdown-open.sh.tmpl', { path: shq(path) })).toBe(`markdown ${shq(path)}`)
  })
})

describe('golden: claude shim files are byte-identical to the old setupShellIntegration', () => {
  // Replica of the old inline construction (sourceUser + assembled content).
  const sourceUser = (name: string): string =>
    `[ -f "\${USER_ZDOTDIR:-$HOME}/${name}" ] && source "\${USER_ZDOTDIR:-$HOME}/${name}"\n`

  it('.zshenv', () => {
    const expected =
      'CRAFTERM_ZDOTDIR="$ZDOTDIR"\n' +
      ': "${USER_ZDOTDIR:=$HOME}"\n' +
      sourceUser('.zshenv') +
      'ZDOTDIR="$CRAFTERM_ZDOTDIR"\n'
    expect(loadScript(TEMPLATES, 'claude-shim.zshenv.tmpl')).toBe(expected)
  })

  it('.zprofile', () => {
    expect(loadScript(TEMPLATES, 'claude-shim.zprofile.tmpl')).toBe(sourceUser('.zprofile'))
  })

  it('.zshrc (with the escaped cmdDir interpolated)', () => {
    const cmdDir = '/Users/me/.crafterm/last-cmd'
    const expected =
      sourceUser('.zshrc') +
      'if [ -n "$CRAFTERM_PANE_ID" ]; then\n' +
      `  crafterm_preexec() { print -r -- "$1" > "${cmdDir}/$CRAFTERM_PANE_ID" 2>/dev/null }\n` +
      '  typeset -ag preexec_functions\n' +
      '  preexec_functions+=(crafterm_preexec)\n' +
      'fi\n' +
      'ZDOTDIR="${USER_ZDOTDIR:-$HOME}"\n'
    expect(loadScript(TEMPLATES, 'claude-shim.zshrc.tmpl', { cmdDir })).toBe(expected)
  })
})
