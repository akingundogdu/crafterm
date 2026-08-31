// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode, WorktreeScripts } from '@views/types/types'

// The settings modal builds EVERY panel when it opens, so a section that throws
// while mounting takes the whole Settings screen down with it (it did — gea only
// compiles JSX inside `template()`, and a helper method returning markup blew up
// at render time). This mounts the section for real to keep that from regressing.

const settings = { worktreeScripts: { pre: [], post: [] } as WorktreeScripts }
const projects: ProjectNode[] = [
  {
    kind: 'project',
    id: 'p1',
    name: 'alpha',
    path: '/repos/alpha',
    children: [],
    worktreeScripts: { pre: [{ id: 'a', name: 'Install', command: 'npm ci' }], post: [] }
  } as unknown as ProjectNode
]

vi.mock('@views/state/spine', () => ({ settings, state: { tree: [] }, uid: (p: string) => p + '1' }))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/catalog/catalog', () => ({
  findProjectById: (_tree: unknown, id: string) => projects.find((p) => p.id === id) ?? null
}))

const { buildWorktreeScriptsSection } = await import(
  '@views/screens/settings/tabs/components/worktree-scripts-section'
)

function mount(projectId: string | null): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  buildWorktreeScriptsSection(host, projectId)
  return host
}

describe('worktree scripts section — mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    settings.worktreeScripts = { pre: [], post: [] }
  })

  it('renders the global scope with both phases and their add buttons', () => {
    const host = mount(null)

    expect(host.textContent).toContain('Worktree scripts')
    expect(host.textContent).toContain('No pre scripts.')
    expect(host.textContent).toContain('No post scripts.')
    expect(host.querySelectorAll('button.settings-inline-btn')).toHaveLength(2)
  })

  it('renders a project scope with its own scripts', () => {
    const host = mount('p1')

    expect(host.textContent).toContain('Install')
    // The fields are uncontrolled inputs seeded in onAfterRender, not text nodes.
    const values = [...host.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value)
    expect(values).toContain('npm ci')
  })

  it('adds a script through the add button', () => {
    const host = mount(null)
    const addPre = host.querySelector('button.settings-inline-btn') as HTMLButtonElement

    addPre.click()

    expect(settings.worktreeScripts.pre).toHaveLength(1)
  })
})
