import { setAllFoldersCollapsed, anyFolderExpanded } from '@views/commands/commands'

// One button toggles every folder: if any is open, collapse all; else expand all.
export function wireCollapseToggle(): void {
  document.getElementById('toggle-all-folders')!.addEventListener('click', () => {
    setAllFoldersCollapsed(anyFolderExpanded())
  })
}
