import { Store } from '@geajs/core'
import type { DailyPlanTask, ProjectNode } from '@views/types/types'
import { state } from '@views/state/spine'
import { uid } from '@views/lib/uid'
import { dailyTaskRepo } from '@repositories'
import { projectTree, findProjectById } from '@views/catalog/catalog'
import { todayKey, nextOrder } from '@views/screens/daily-plan/daily-plan.store'
import { openTaskInTerminal } from '@views/screens/daily-plan/daily-plan.entry'
import { promptConfirm } from '@views/components/dialog/confirm'
import { newTab } from '@views/commands/commands'
import { showSpotlight } from '@views/screens/spotlight/spotlight'
import { gitService } from '@services'
import type { ComposerMode, SlashItem } from './agent-composer.types'

// The agent composer — the content area's start screen, shown whenever no tab is
// selected (fresh launch, every tab closed, Cmd+Shift+N). Describe a piece of work,
// pick the project, the base branch and where it runs, and Crafterm files it as a
// Daily Plan ticket and starts a Claude terminal on it: in a fresh worktree named
// after the issue key, or in the project itself. Below it sit the plain escape
// hatches (New Terminal / Open Project). Model of the view; the view holds no logic.

export const DEFAULT_BASE = 'main'

export const MODES: { val: ComposerMode; label: string }[] = [
  { val: 'local', label: 'Local' },
  { val: 'worktree', label: 'Worktree' }
]

export const COMPOSER_PLACEHOLDER = 'Describe the work — a ticket is filed and Claude picks it up'
export const COMPOSER_HINT = '⌘↵ to start · / for projects and modes'

// ---- "/" menu ---------------------------------------------------------------

// The fixed commands. Projects are appended at filter time (they come from the
// sidebar tree, which changes under us).
const SLASH_COMMANDS: SlashItem[] = [
  { id: 'plan', kind: 'plan', label: 'plan', detail: 'Plan first, build after approval' },
  { id: 'build', kind: 'build', label: 'build', detail: 'Start building right away' },
  { id: 'local', kind: 'local', label: 'local', detail: 'Run in the project itself' },
  { id: 'worktree', kind: 'worktree', label: 'worktree', detail: 'Run in a worktree for the ticket' }
]

// The "/token" being typed at the caret, if any: a "/" at the start of a word,
// followed by no whitespace up to the caret. Returns the query (without the "/")
// and the "/" index, so picking an entry can cut the token back out of the text.
export function slashQueryAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before)
  if (!match) return null
  return { query: match[1], start: before.length - match[1].length - 1 }
}

// Entries matching the query (contains, case-insensitive), best match first: an
// exact name beats a prefix, a prefix beats a mid-word hit. So "/backend" puts the
// backend project at the top, ready for Enter, while "/bac" still lists it.
export function slashItemsFor(query: string): SlashItem[] {
  const projects: SlashItem[] = projectTree(state.tree)
    .map((entry) => entry.p)
    .filter((p) => p.path)
    .map((p) => ({ id: `project:${p.id}`, kind: 'project' as const, label: p.name, detail: p.path, projectId: p.id }))

  const q = query.trim().toLowerCase()
  const rank = (label: string): number => {
    const l = label.toLowerCase()
    if (l === q) return 0
    if (l.startsWith(q)) return 1
    return 2
  }
  return [...SLASH_COMMANDS, ...projects]
    .filter((item) => !q || item.label.toLowerCase().includes(q))
    .sort((a, b) => rank(a.label) - rank(b.label))
}

// Text with the "/token" cut out, plus where the caret lands afterwards.
export function textWithoutSlash(text: string, start: number, caret: number): { text: string; caret: number } {
  return { text: text.slice(0, start) + text.slice(caret), caret: start }
}
export const PLAN_LABEL = 'Plan'
export const BUILD_LABEL = 'Build'

export const LAPTOP_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3.5" width="10" height="7" rx="1"/><path d="M1.5 12.5h13"/></svg>'

// ---- Escape hatches below the composer --------------------------------------

export const PICK_HINT = 'Or pick a terminal on the left.'

export const TERMINAL_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6.5 6.5 8.5 4 10.5"/><path d="M8.5 10.5h3.5"/></svg>'
export const SPOTLIGHT_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>'

export function openNewTerminal(): void {
  void newTab()
}

// "Open Project" lands straight on the spotlight's Projects tab.
export function openSpotlight(): void {
  void showSpotlight('projects')
}

// The prompt text lives outside the reactive store on purpose: a store write
// re-renders the composer, and a reactive `value=` binding would make gea treat the
// textarea as controlled (§gea gotchas). The view seeds this draft — and the caret,
// which matters while a "/" menu is open mid-text — back into the textarea in
// onAfterRender, so a dropdown change never wipes what was typed.
let draft = ''
let draftCaret = 0

export function getDraft(): string {
  return draft
}

export function getDraftCaret(): number {
  return Math.min(draftCaret, draft.length)
}

export function setDraft(text: string, caret = text.length): void {
  draft = text
  draftCaret = caret
}

async function showMessage(title: string, message: string): Promise<void> {
  await promptConfirm({ title, message, confirmText: 'OK' })
}

class AgentComposerStore extends Store {
  projectId: string | null = null
  branches: string[] = []
  baseBranch: string = DEFAULT_BASE
  mode: ComposerMode = 'local'
  isPlanMode = false
  isBusy = false
  // Bumped on every refresh. The project dropdown reads the sidebar tree (not a
  // reactive source), so a refresh that changes nothing else — the same project
  // still selected — must still force a re-render to pick up a tree that has since
  // been restored/edited. The view subscribes by writing it into its output.
  rev = 0

  // "/" menu: the entries matching what's typed after the slash, and the highlighted
  // one. Empty list = closed.
  slashItems: SlashItem[] = []
  slashIndex = 0

  get isSlashOpen(): boolean {
    return this.slashItems.length > 0
  }

  get activeSlashItem(): SlashItem | null {
    return this.slashItems[this.slashIndex] ?? null
  }

  // Re-evaluate the menu against the text at the caret. Writes only when the result
  // actually changed — every write re-renders the composer, and this runs per
  // keystroke.
  syncSlash(text: string, caret: number): void {
    const q = slashQueryAt(text, caret)
    const items = q ? slashItemsFor(q.query) : []
    const same =
      items.length === this.slashItems.length && items.every((item, i) => item.id === this.slashItems[i].id)
    if (same) return
    this.slashItems = items
    this.slashIndex = 0
  }

  closeSlash(): void {
    if (this.slashItems.length) this.slashItems = []
    this.slashIndex = 0
  }

  moveSlash(delta: number): void {
    const count = this.slashItems.length
    if (!count) return
    this.slashIndex = (this.slashIndex + delta + count) % count
  }

  // Apply a "/" entry: it switches the project / plan mode / run mode, and the token
  // is cut back out of the prompt. Returns the new text + caret for the textarea.
  applySlash(item: SlashItem, text: string, caret: number): { text: string; caret: number } {
    if (item.kind === 'project' && item.projectId) void this.setProject(item.projectId)
    else if (item.kind === 'plan') this.setPlanMode(true)
    else if (item.kind === 'build') this.setPlanMode(false)
    else if (item.kind === 'local' || item.kind === 'worktree') this.setMode(item.kind)

    const q = slashQueryAt(text, caret)
    const next = q ? textWithoutSlash(text, q.start, caret) : { text, caret }
    this.closeSlash()
    setDraft(next.text, next.caret)
    return next
  }

  // The dropdown itself is the shared ProjectSelect (it reads the sidebar tree); the
  // store only tracks which project is picked.
  get selectedProject(): ProjectNode | null {
    return this.projectId ? findProjectById(state.tree, this.projectId) : null
  }

  // Re-seed the selection from the sidebar and load that project's branches. Called
  // every time the empty state is shown, so a project added in the meantime shows up
  // — and a removed one doesn't stay selected.
  async refresh(): Promise<void> {
    const projects = projectTree(state.tree).map((entry) => entry.p).filter((p) => p.path)
    if (!projects.some((p) => p.id === this.projectId)) {
      this.projectId = projects[0]?.id ?? null
    }
    await this.loadBranches()
    this.rev++
  }

  async setProject(id: string): Promise<void> {
    if (id === this.projectId) return
    this.projectId = id
    await this.loadBranches()
  }

  // Local branches of the selected project, most-recently-committed first. Prefer
  // `main` as the base when it exists — that's what worktrees branched off before
  // the base became selectable.
  private async loadBranches(): Promise<void> {
    const project = this.selectedProject
    if (!project?.path) {
      this.branches = []
      this.baseBranch = DEFAULT_BASE
      return
    }
    // A failure here (not a repo, git missing) must not keep the start screen from
    // rendering — fall back to no branch list.
    let branches: string[] = []
    try {
      branches = await gitService.branchesAt(project.path)
    } catch {
      branches = []
    }
    this.branches = branches
    this.baseBranch = branches.includes(DEFAULT_BASE) ? DEFAULT_BASE : branches[0] ?? DEFAULT_BASE
  }

  setBaseBranch(branch: string): void {
    this.baseBranch = branch
  }

  setMode(mode: ComposerMode): void {
    this.mode = mode
  }

  setPlanMode(isPlan: boolean): void {
    this.isPlanMode = isPlan
  }

  // File the typed text as a ticket in the selected project and hand it to a Claude
  // terminal — in a worktree branched off the chosen base, or in the project itself.
  async submit(text: string): Promise<void> {
    const title = text.trim()
    if (!title || this.isBusy) return
    const project = this.selectedProject
    if (!project) {
      await showMessage('No project', 'Add a project to the sidebar first, then start work from here.')
      return
    }
    // openTaskInTerminal needs an issue key (the worktree branch is named after it),
    // so check the prefix before filing a ticket we'd have to abandon.
    if (!project.issueKeyPrefix?.trim()) {
      await showMessage(
        'No issue key prefix',
        `Set an issue key prefix on “${project.name}” (project settings) so tickets can be keyed.`
      )
      return
    }

    this.isBusy = true
    try {
      const now = Date.now()
      const date = todayKey()
      const task: DailyPlanTask = {
        id: uid('task'),
        title,
        date,
        status: 'todo',
        priority: 'medium',
        tagIds: [],
        projectId: project.id,
        order: nextOrder(date, 'todo'),
        createdAt: now,
        updatedAt: now
      }
      dailyTaskRepo.upsert(task)
      setDraft('')
      await openTaskInTerminal(task, () => {}, this.mode === 'worktree', {
        base: this.baseBranch,
        isPlanMode: this.isPlanMode
      })
    } finally {
      this.isBusy = false
    }
  }
}

export default new AgentComposerStore()
