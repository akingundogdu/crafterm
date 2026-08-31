import { describe, it, expect } from 'vitest'
import {
  worktreePathFor,
  normalizeWorktreeScripts,
  expandWorktreePlaceholders,
  collectWorktreeScripts,
  buildWorktreeCommand,
  buildExistingWorktreeCommand,
  buildWorktreeSetupChain,
  scriptStepId
} from '@services/domain/worktree-command'
import type { WorktreeScripts } from '@views/types/types'

const script = (id: string, command: string) => ({ id, name: id, command })

const base = {
  repoRoot: '/repos/alpha',
  worktreePath: '/repos/worktrees/CRF-1',
  branch: 'CRF-1',
  base: 'main'
}

describe('worktreePathFor', () => {
  it('mirrors the shell function: <parent-of-repo>/worktrees/<name>', () => {
    expect(worktreePathFor('/repos/alpha', 'CRF-1')).toBe('/repos/worktrees/CRF-1')
  })

  it('ignores a trailing slash on the repo root', () => {
    expect(worktreePathFor('/repos/alpha/', 'CRF-1')).toBe('/repos/worktrees/CRF-1')
  })
})

describe('normalizeWorktreeScripts', () => {
  it('keeps usable rows and drops malformed ones', () => {
    const out = normalizeWorktreeScripts({
      pre: [{ id: 'a', name: 'A', command: 'echo a' }, { name: 'no command' }, null],
      post: [{ command: 'echo b' }]
    })

    expect(out.pre).toEqual([{ id: 'a', name: 'A', command: 'echo a' }])
    expect(out.post).toHaveLength(1)
    expect(out.post[0].command).toBe('echo b')
  })

  it('returns empty lists for junk', () => {
    expect(normalizeWorktreeScripts(null)).toEqual({ pre: [], post: [] })
    expect(normalizeWorktreeScripts({ pre: 'nope' })).toEqual({ pre: [], post: [] })
  })
})

describe('expandWorktreePlaceholders', () => {
  it('substitutes every supported placeholder', () => {
    const out = expandWorktreePlaceholders(
      'codegraph init -i {worktreePath} # {repoRoot} {branch} {name} {base}',
      base
    )

    expect(out).toBe('codegraph init -i /repos/worktrees/CRF-1 # /repos/alpha CRF-1 CRF-1 main')
  })
})

describe('collectWorktreeScripts', () => {
  const global: WorktreeScripts = { pre: [script('g1', 'echo g1')], post: [script('g2', 'echo g2')] }
  const project: WorktreeScripts = { pre: [script('p1', 'echo p1')], post: [script('p2', '   ')] }

  it('runs the global scripts before the project ones', () => {
    expect(collectWorktreeScripts(global, project, 'pre').map((s) => s.id)).toEqual(['g1', 'p1'])
  })

  it('drops blank commands', () => {
    expect(collectWorktreeScripts(global, project, 'post').map((s) => s.id)).toEqual(['g2'])
  })

  it('handles missing lists', () => {
    expect(collectWorktreeScripts(null, undefined, 'pre')).toEqual([])
  })
})

describe('buildWorktreeCommand', () => {
  it('creates the worktree and enters it when there are no scripts', () => {
    expect(buildWorktreeCommand(base)).toBe(
      "run-create-worktree 'CRF-1' 'main' ; cd '/repos/worktrees/CRF-1'"
    )
  })

  it('chains pre scripts before the creation and post scripts inside the worktree', () => {
    const command = buildWorktreeCommand({
      ...base,
      global: { pre: [script('g1', 'echo pre')], post: [script('g2', 'codegraph init -i .')] }
    })

    expect(command).toBe(
      "echo pre ; run-create-worktree 'CRF-1' 'main' ; " +
        "cd '/repos/worktrees/CRF-1' && { codegraph init -i . ; }"
    )
  })

  it('appends the trailing command after the post scripts, inside the worktree', () => {
    const command = buildWorktreeCommand({
      ...base,
      global: { pre: [], post: [script('g2', 'codegraph init -i .')] },
      trailing: "claude 'ultrathink CRF-1'"
    })

    expect(command).toContain(
      "cd '/repos/worktrees/CRF-1' && { codegraph init -i . ; claude 'ultrathink CRF-1' ; }"
    )
  })

  it('joins with `;` so one failing script never blocks the next', () => {
    const command = buildWorktreeCommand({
      ...base,
      global: { pre: [script('a', 'false'), script('b', 'echo b')], post: [] }
    })

    expect(command).toContain('false ; echo b ; run-create-worktree')
    expect(command).not.toContain('false &&')
  })

  it('expands placeholders in the scripts', () => {
    const command = buildWorktreeCommand({
      ...base,
      global: { pre: [], post: [script('g', 'codegraph init -i {worktreePath}')] }
    })

    expect(command).toContain('codegraph init -i /repos/worktrees/CRF-1')
  })

  it('quotes the branch and base', () => {
    const command = buildWorktreeCommand({ ...base, branch: "it's", base: 'ma in' })

    expect(command).toContain(`run-create-worktree 'it'\\''s' 'ma in'`)
  })
})

describe('buildWorktreeCommand — step reporting', () => {
  const scripts = {
    pre: [{ id: 'a', name: 'Install', command: 'npm ci' }],
    post: [{ id: 'b', name: 'Index', command: 'codegraph init -i .' }]
  }

  it('wraps each step in start/exit markers when reporting is on', () => {
    const command = buildWorktreeCommand({ ...base, global: scripts, report: true })

    // Every step announces itself, and reports the exit status of its own command.
    expect(command).toContain(`printf '\\033]777;%s\\007' 'wt;pre:a;start' ; npm ci ;`)
    expect(command).toContain(`printf '\\033]777;wt;%s;done;%d\\007' 'pre:a' "$?"`)
    expect(command).toContain(`'wt;creating;start' ; run-create-worktree`)
    expect(command).toContain(`'wt;post:b;start' ; codegraph init -i . ;`)
  })

  it('emits no markers by default', () => {
    expect(buildWorktreeCommand({ ...base, global: scripts })).not.toContain('033]777')
  })

  it('gives each script the step id the overlay lists it under', () => {
    expect(scriptStepId('pre', scripts.pre[0])).toBe('pre:a')
    expect(scriptStepId('post', scripts.post[0])).toBe('post:b')
  })
})

describe('buildExistingWorktreeCommand', () => {
  it('only enters an existing worktree — no creation, no setup scripts', () => {
    expect(buildExistingWorktreeCommand('/repos/worktrees/CRF-1')).toBe("cd '/repos/worktrees/CRF-1'")
  })

  it('runs the trailing command there', () => {
    expect(buildExistingWorktreeCommand('/repos/worktrees/CRF-1', 'claude')).toBe(
      "cd '/repos/worktrees/CRF-1' && claude"
    )
  })
})

describe('buildWorktreeSetupChain', () => {
  it('wraps the chain in a subshell so the caller keeps its own directory', () => {
    const chain = buildWorktreeSetupChain({
      ...base,
      global: { pre: [], post: [script('g', 'codegraph init -i .')] },
      trailing: 'npm run dev'
    })

    expect(chain).toBe(
      "( run-create-worktree 'CRF-1' 'main' ; cd '/repos/worktrees/CRF-1' && { codegraph init -i . ; } )"
    )
    // The caller chains its own command after the subshell.
    expect(chain).not.toContain('npm run dev')
  })
})
