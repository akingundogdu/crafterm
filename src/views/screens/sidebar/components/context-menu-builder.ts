import type { SidebarNode, FolderNode, ProjectNode } from '@views/types/types'
import { UITexts } from '@texts'
import { startBackgroundProcess } from '@services/bgproc'
import { state, settings, paneActions } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { ancestorFolders } from '@views/tree/tree'
import {
  selectTab,
  closeTab,
  togglePin,
  toggleCollapse,
  deleteFolder,
  newTab,
  newClaudeTab,
  newFolder,
  autoNameTab,
  setNodeGroup
} from '@views/commands/commands'
import { showRunApps, showFeatureSetup, showRunCommand } from '@views/screens/pickers/project/project'
import { promptText } from '@views/components/dialog/prompt-text'
import { promptSelect } from '@views/components/dialog/prompt-select'
import { type ContextMenuItem } from '@views/components/context-menu/context-menu'
import { iosWorktreeMenuItems } from '@views/screens/ios-worktree/ios-worktree'
import { isWorktreeFolder, isWorktreeContainer, worktreeProjectOf, newWorktree, removeWorktree } from '@services/worktrees'
import { shellService } from '@services'
import { knownGroups } from '../sidebar.store'
import { showFolderSettings } from './folder-settings-modal'

// Collaborators the context menu needs from the shell: the tree (for inline
// rename) and the archived-view toggle/state.
export interface MenuContext {
  beginRename: (id: string) => void
  isArchivedView: () => boolean
  toggleArchivedView: () => void
  renderSidebar: () => void
}

// Context-menu action: pick a group/workspace for a container from a dropdown
// (or create a new one). Groups are managed in Settings → Projects → Groups.
async function promptGroup(node: FolderNode | ProjectNode): Promise<void> {
  const g = await promptSelect({
    title: 'Set group',
    label: UITexts.Sidebar.groupWorkspace,
    value: node.group ?? '',
    options: knownGroups(),
    emptyLabel: '(Ungrouped)',
    allowCreate: true,
    confirmText: 'Set'
  })
  if (g === null) return
  const group = g.trim()
  if (group && !settings.groups.includes(group)) {
    settings.groups.push(group)
    persistence.save()
  }
  setNodeGroup(node.id, group)
}

export function buildMenu(node: SidebarNode, ctx: MenuContext): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (node.kind === 'tab' && node.status === 'archived') {
    // Archived session (shown only under "Show archived items"): reactivate it.
    items.push({ label: UITexts.Sidebar.menu.restoreSession, run: () => paneActions.reactivateTab(node.id) })
  } else if (node.kind === 'tab') {
    const trail = ancestorFolders(state.tree, node.id)
    const parentId = trail && trail.length ? trail[trail.length - 1].id : null
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminal, run: () => void newClaudeTab(parentId) })
    items.push({ label: UITexts.Sidebar.menu.rename, run: () => ctx.beginRename(node.id) })
    if (node.titleLocked) items.push({ label: UITexts.Sidebar.menu.autoName, run: () => autoNameTab(node.id) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: UITexts.Sidebar.menu.closeTab, run: () => closeTab(node.id), danger: true })
  } else if (isWorktreeFolder(node)) {
    // A worktree node: a dedicated, type-aware menu — git-managed, so the generic
    // folder operations don't apply.
    const wt = node.worktreePath
    const proj = worktreeProjectOf(node)
    items.push({ label: UITexts.Sidebar.menu.newTerminalHere, run: () => void newTab(node.id, wt) })
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminalHere, run: () => void newClaudeTab(node.id, wt) })
    items.push({
      label: UITexts.Sidebar.menu.runInBackground,
      run: () =>
        void promptText({
          title: 'Run in background',
          label: UITexts.Sidebar.menu.command,
          placeholder: UITexts.Sidebar.commandPlaceholder,
          confirmText: 'Run'
        }).then((command) => {
          const cmd = command?.trim()
          if (cmd) void startBackgroundProcess(node, { title: cmd, command: cmd, role: 'shell' })
        })
    })
    for (const it of iosWorktreeMenuItems(node)) items.push(it)
    items.push({ label: UITexts.Sidebar.menu.revealInFinder, run: () => shellService.revealPath(wt) })
    if (proj) {
      items.push({ label: UITexts.Sidebar.menu.deleteWorktree, danger: true, run: () => void removeWorktree(proj, wt) })
    }
  } else if (isWorktreeContainer(node)) {
    // The auto "worktrees" container: only "new worktree" (it's auto-managed).
    const proj = worktreeProjectOf(node)
    if (proj) items.push({ label: UITexts.Sidebar.menu.newWorktree, run: () => void newWorktree(proj) })
    items.push({ label: node.collapsed ? 'Expand' : 'Collapse', run: () => toggleCollapse(node.id) })
  } else {
    // A project node opens its terminals at the project's path; other folders
    // inherit the active terminal's cwd (the legacy behaviour).
    const cwd = node.kind === 'project' ? node.path : undefined
    items.push({ label: UITexts.Sidebar.menu.newTerminalHere, run: () => void newTab(node.id, cwd) })
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminalHere, run: () => void newClaudeTab(node.id, cwd) })
    items.push({ label: UITexts.Sidebar.menu.newSubfolder, run: () => void newFolder(node.id) })
    if (node.kind === 'project') {
      items.push({ label: UITexts.Sidebar.menu.runApplications, run: () => showRunApps(node) })
      if (node.runCommands && node.runCommands.length) {
        items.push({ label: UITexts.Sidebar.menu.runCommand, run: () => showRunCommand(node) })
      }
      items.push({ label: UITexts.Sidebar.menu.newFeature, run: () => showFeatureSetup(node) })
    }
    items.push({ label: UITexts.Sidebar.menu.rename, run: () => ctx.beginRename(node.id) })
    items.push({ label: UITexts.Sidebar.menu.setGroup, run: () => void promptGroup(node) })
    items.push({ label: UITexts.Sidebar.menu.folderSettings, run: () => showFolderSettings(node, ctx.renderSidebar) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: UITexts.Sidebar.menu.deleteFolder, run: () => deleteFolder(node.id), danger: true })
  }
  items.push({
    label: ctx.isArchivedView() ? UITexts.Sidebar.showActiveItems : UITexts.Sidebar.showArchivedItems,
    run: () => ctx.toggleArchivedView()
  })
  return items
}
