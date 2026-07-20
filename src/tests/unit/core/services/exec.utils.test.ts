import { describe, it, expect } from 'vitest'
import {
  isBarePath,
  mergePath,
  extractMarkedPath,
  PATH_MARKER_START,
  PATH_MARKER_END
} from '../../../../core/services/exec/exec.utils'

const GUI_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const SHELL_PATH = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

describe('isBarePath', () => {
  it('flags the PATH macOS hands a GUI-launched app', () => {
    expect(isBarePath(GUI_PATH)).toBe(true)
  })

  it('leaves a PATH inherited from a shell alone', () => {
    expect(isBarePath(SHELL_PATH)).toBe(false)
  })

  it('ignores ordering and empty entries', () => {
    expect(isBarePath('/sbin::/bin:/usr/bin:/usr/sbin:')).toBe(true)
  })

  it('treats an empty PATH as bare', () => {
    expect(isBarePath('')).toBe(true)
  })
})

describe('mergePath', () => {
  it('prepends the entries the login shell adds, keeping its precedence', () => {
    expect(mergePath(GUI_PATH, SHELL_PATH)).toBe(
      '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:' + GUI_PATH
    )
  })

  it('makes git-lfs reachable from the merged PATH', () => {
    const merged = mergePath(GUI_PATH, SHELL_PATH)
    expect(merged?.split(':')).toContain('/opt/homebrew/bin')
  })

  it('returns null when the discovered PATH adds nothing', () => {
    expect(mergePath(SHELL_PATH, GUI_PATH)).toBeNull()
    expect(mergePath(GUI_PATH, GUI_PATH)).toBeNull()
    expect(mergePath(GUI_PATH, '')).toBeNull()
  })

  it('never duplicates an entry already present', () => {
    const merged = mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin:/bin')
    expect(merged).toBe('/opt/homebrew/bin:/usr/bin:/bin')
  })
})

describe('extractMarkedPath', () => {
  const wrap = (path: string) => `${PATH_MARKER_START}${path}${PATH_MARKER_END}`

  it('pulls the PATH out of the shell output', () => {
    expect(extractMarkedPath(wrap(SHELL_PATH) + '\n')).toBe(SHELL_PATH)
  })

  it('ignores noise a .zprofile prints around it', () => {
    const out = `nvm: loaded v22\n${wrap(SHELL_PATH)}\ndone\n`
    expect(extractMarkedPath(out)).toBe(SHELL_PATH)
  })

  it('returns null when the shell failed before echoing', () => {
    expect(extractMarkedPath('')).toBeNull()
    expect(extractMarkedPath('zsh: command not found')).toBeNull()
    expect(extractMarkedPath(PATH_MARKER_START + SHELL_PATH)).toBeNull()
  })
})
