import { Store } from '@geajs/core'
import type { DailyPlanTag, DailyPlanTask, ProjectNode } from '@views/types/types'
import { state } from '@views/state/spine'
import { uid } from '@views/lib/uid'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { projectTree, findProjectById } from '@views/catalog/catalog'
import { todayKey, nextOrder, sanitizeSlug } from '@views/screens/daily-plan/daily-plan.store'
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

// The composer files a Daily Plan ticket; keep its title short (a glanceable label in
// the sidebar and on the terminal tab) and carry the full prompt in the description, so
// Claude still receives everything the user typed.
export const COMPOSER_TITLE_MAX = 20

export const MODES: { val: ComposerMode; label: string }[] = [
  { val: 'local', label: 'Local' },
  { val: 'worktree', label: 'Worktree' }
]

export const COMPOSER_PLACEHOLDER = 'Describe the work — a ticket is filed and Claude picks it up'
export const COMPOSER_HINT = '⌘↵ to start · / for projects, labels and modes'
export const TITLE_PLACEHOLDER = 'Title'
export const BRANCH_PLACEHOLDER = 'Branch name'

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
// backend project at the top, ready for Enter, while "/bac" still lists it. The
// same holds for labels — "/urgent" surfaces the urgent label ready for Enter.
// `selectedLabelIds` marks the labels already on the ticket, so picking one reads
// as a toggle rather than a blind add.
export function slashItemsFor(query: string, selectedLabelIds: string[] = []): SlashItem[] {
  const projects: SlashItem[] = projectTree(state.tree)
    .map((entry) => entry.p)
    .filter((p) => p.path)
    .map((p) => ({ id: `project:${p.id}`, kind: 'project' as const, label: p.name, detail: p.path, projectId: p.id }))

  const labels: SlashItem[] = dailyTagRepo.getAll().map((tag) => {
    const isOn = selectedLabelIds.includes(tag.id)
    return {
      id: `label:${tag.id}`,
      kind: 'label' as const,
      label: tag.name,
      detail: isOn ? 'Label — remove from the ticket' : 'Label — add to the ticket',
      labelId: tag.id,
      isOn
    }
  })

  const q = query.trim().toLowerCase()
  const rank = (label: string): number => {
    const l = label.toLowerCase()
    if (l === q) return 0
    if (l.startsWith(q)) return 1
    return 2
  }
  return [...SLASH_COMMANDS, ...projects, ...labels]
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

// Push the current draft (and caret) into the textarea. The box is uncontrolled and
// gea's onAfterRender is mount-only, so a re-shown composer keeps the textarea's stale
// DOM value — the view calls this on every show to resync it (empty after a submit).
export function seedDraftInto(input: HTMLTextAreaElement): void {
  input.value = getDraft()
  const caret = getDraftCaret()
  input.setSelectionRange(caret, caret)
}

// The ticket meta (title + branch slug) follows the same non-reactive draft pattern
// as the prompt: a store write per keystroke would re-render the composer and fight
// the uncontrolled inputs. The title mirrors the prompt's first COMPOSER_TITLE_MAX
// characters until the user edits it by hand (that breaks the prompt→title bond for
// good, until the next submit). The branch is ALWAYS re-derived from the title on a
// title change — a hand-typed branch survives only until the title changes again.
let titleDraft = ''
let branchDraft = ''
let isTitleTouched = false

export function getTitleDraft(): string {
  return titleDraft
}

export function getBranchDraft(): string {
  return branchDraft
}

// Slug shape for the branch box WHILE TYPING: lowercase, runs of invalid characters
// to a single dash — but a trailing dash survives (sanitizeSlug would trim it, making
// it impossible to type "fix-login" past "fix-"). Submit sanitizes the final value.
export function liveSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
}

// Prompt keystroke → title (first COMPOSER_TITLE_MAX chars) + branch, unless the
// user has taken the title over by hand.
export function syncTitleFromPrompt(text: string): void {
  if (isTitleTouched) return
  const title = text.trim().slice(0, COMPOSER_TITLE_MAX)
  if (title === titleDraft) return
  titleDraft = title
  branchDraft = sanitizeSlug(title)
}

// A hand-edited title breaks the prompt→title bond and re-derives the branch — the
// branch always follows the title.
export function setTitleDraft(text: string): void {
  isTitleTouched = true
  titleDraft = text
  branchDraft = sanitizeSlug(text)
}

// A hand-edited branch keeps its slug shape but does NOT break the title→branch
// bond: the next title change re-derives it. Returns the slugged value so the view
// can write it back into the input.
export function setBranchDraft(text: string): string {
  branchDraft = liveSlug(text)
  return branchDraft
}

export function resetTicketMeta(): void {
  titleDraft = ''
  branchDraft = ''
  isTitleTouched = false
}

// Push the meta drafts into the (uncontrolled) title + branch inputs — the meta
// counterpart of seedDraftInto, called on every show and after a prompt keystroke.
export function seedMetaInto(titleInput: HTMLInputElement, branchInput: HTMLInputElement): void {
  titleInput.value = titleDraft
  branchInput.value = branchDraft
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
  // The Daily Plan tags the filed ticket carries. `labels` is a snapshot of the tag
  // repo (which is not a reactive source) re-read on every refresh, so the dropdown
  // and the "/" menu pick up a tag added on the board meanwhile; `labelIds` is the
  // multi-select, reassigned (never mutated in place) so gea re-renders on a toggle.
  labels: DailyPlanTag[] = []
  labelIds: string[] = []
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
    const items = q ? slashItemsFor(q.query, this.labelIds) : []
    const same =
      items.length === this.slashItems.length &&
      items.every((item, i) => item.id === this.slashItems[i].id && item.isOn === this.slashItems[i].isOn)
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
    else if (item.kind === 'label' && item.labelId) this.toggleLabel(item.labelId)

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
    this.loadLabels()
    await this.loadBranches()
    this.rev++
  }

  // Re-snapshot the tag repo (§5.3: fresh objects, never the repo's own records) and
  // drop any picked label that has since been deleted on the board.
  private loadLabels(): void {
    this.labels = dailyTagRepo.getAll().map((tag) => ({ ...tag }))
    const live = new Set(this.labels.map((tag) => tag.id))
    const kept = this.labelIds.filter((id) => live.has(id))
    if (kept.length !== this.labelIds.length) this.labelIds = kept
  }

  // The picked labels, in repo order (not pick order) so the button caption is stable.
  get selectedLabels(): DailyPlanTag[] {
    return this.labels.filter((tag) => this.labelIds.includes(tag.id))
  }

  isLabelOn(id: string): boolean {
    return this.labelIds.includes(id)
  }

  // Reassigned, never spliced: gea only re-renders on a field write.
  toggleLabel(id: string): void {
    this.labelIds = this.labelIds.includes(id)
      ? this.labelIds.filter((x) => x !== id)
      : [...this.labelIds, id]
  }

  clearLabels(): void {
    if (this.labelIds.length) this.labelIds = []
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
  // Returns true when the ticket was filed (the prompt was consumed), so the view
  // knows to clear the textarea; a refused submit keeps the text for another try.
  async submit(text: string): Promise<boolean> {
    const full = text.trim()
    if (!full || this.isBusy) return false
    const project = this.selectedProject
    if (!project) {
      await showMessage('No project', 'Add a project to the sidebar first, then start work from here.')
      return false
    }
    // openTaskInTerminal needs an issue key (the worktree branch is named after it),
    // so check the prefix before filing a ticket we'd have to abandon.
    if (!project.issueKeyPrefix?.trim()) {
      await showMessage(
        'No issue key prefix',
        `Set an issue key prefix on “${project.name}” (project settings) so tickets can be keyed.`
      )
      return false
    }

    this.isBusy = true
    try {
      const now = Date.now()
      const date = todayKey()
      // The title box (auto-filled from the prompt, hand-editable) labels the ticket;
      // the full prompt rides in the description so openTaskInTerminal still hands
      // Claude everything that was typed. An emptied title falls back to the prompt.
      const title = getTitleDraft().trim() || full.slice(0, COMPOSER_TITLE_MAX)
      const slug = sanitizeSlug(getBranchDraft())
      const task: DailyPlanTask = {
        id: uid('task'),
        title,
        description: full !== title ? full : undefined,
        worktreeSlug: slug || undefined,
        date,
        status: 'todo',
        priority: 'medium',
        tagIds: this.labelIds.slice(),
        projectId: project.id,
        order: nextOrder(date, 'todo'),
        createdAt: now,
        updatedAt: now
      }
      dailyTaskRepo.upsert(task)
      await openTaskInTerminal(task, () => {}, this.mode === 'worktree', {
        base: this.baseBranch,
        isPlanMode: this.isPlanMode
      })
      // Clear the draft only after the terminal is up: the Cmd+Enter keyup still
      // fires on the textarea (whose value is the old text) and its selection
      // handler writes that value back into the draft — clearing here, after the
      // keyup has come and gone, is what makes the empty draft stick. A failed
      // launch (throw above) keeps the draft, so the prompt survives for a retry.
      setDraft('')
      resetTicketMeta()
      return true
    } finally {
      this.isBusy = false
    }
  }
}

export default new AgentComposerStore()
