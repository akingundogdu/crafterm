import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode, WorktreeScripts } from '@views/types/types'

const save = vi.fn()
const settings = { worktreeScripts: { pre: [], post: [] } as WorktreeScripts }
const projects: ProjectNode[] = []
let seq = 0

vi.mock('@views/state/spine', () => ({
  settings,
  state: { tree: [] },
  uid: (p: string) => `${p}${++seq}`
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => save() } }))
vi.mock('@views/catalog/catalog', () => ({
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))

const store = (await import('@views/screens/settings/tabs/components/worktree-scripts-section.store'))
  .default

function project(): ProjectNode {
  return { kind: 'project', id: 'p1', name: 'alpha', path: '/repos/alpha', children: [] } as unknown as ProjectNode
}

describe('worktree scripts store — global scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings.worktreeScripts = { pre: [], post: [] }
    store.reload(null)
  })

  it('adds, renames and edits a post script on the global settings', () => {
    store.add('post')
    const id = settings.worktreeScripts.post[0].id
    store.setName('post', id, '  Index the worktree  ')
    store.setCommand('post', id, ' codegraph init -i . ')

    expect(settings.worktreeScripts.post).toEqual([
      { id, name: 'Index the worktree', command: 'codegraph init -i .' }
    ])
    // The reactive copies the view reads mirror the write.
    expect(store.post[0].command).toBe('codegraph init -i .')
    expect(save).toHaveBeenCalled()
  })

  it('removes a script', () => {
    store.add('pre')
    store.add('pre')
    const [first, second] = settings.worktreeScripts.pre

    store.remove('pre', first.id)

    expect(settings.worktreeScripts.pre).toEqual([second])
    expect(store.pre).toEqual([second])
  })

  it('keeps pre and post apart', () => {
    store.add('pre')

    expect(settings.worktreeScripts.pre).toHaveLength(1)
    expect(settings.worktreeScripts.post).toHaveLength(0)
  })
})

describe('worktree scripts store — project scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings.worktreeScripts = { pre: [], post: [] }
    projects.length = 0
    projects.push(project())
    store.reload('p1')
  })

  it('creates the project lists on first write and leaves the global ones alone', () => {
    expect(projects[0].worktreeScripts).toBeUndefined()

    store.add('post')

    expect(projects[0].worktreeScripts?.post).toHaveLength(1)
    expect(settings.worktreeScripts.post).toHaveLength(0)
  })

  it('reads an existing project list on reload', () => {
    projects[0].worktreeScripts = { pre: [{ id: 'a', name: 'A', command: 'echo a' }], post: [] }

    store.reload('p1')

    expect(store.pre).toEqual([{ id: 'a', name: 'A', command: 'echo a' }])
    expect(store.post).toEqual([])
  })

  it('ignores writes for a project that is gone', () => {
    store.reload('missing')
    store.add('pre')

    expect(save).not.toHaveBeenCalled()
  })
})
