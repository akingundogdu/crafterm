import type { SidebarNode } from '@views/types/types'
import type { TreeSection } from '@views/components/treeview/treeview'
import { UITexts } from '@texts'
import { state, settings } from '@views/state/spine'
import { collectPinnedRoots, isContainer } from '@views/tree/tree'
import { recencyBucket, maxActivityOf, stripPinned } from '../sidebar.store'
import { sectionLabel, groupHeader } from './section-label'

// Build the section list: Pinned → Free → group buckets (or recency buckets).
// `passesArchiveFilter` is injected by the shell (it owns the archived-view flag).
export function buildSections(passesArchiveFilter: (n: SidebarNode) => boolean): TreeSection<SidebarNode>[] {
  const sections: TreeSection<SidebarNode>[] = []

  const pinned = collectPinnedRoots(state.tree).filter(passesArchiveFilter)
  if (pinned.length) sections.push({ header: sectionLabel(UITexts.Sidebar.sections.pinned), nodes: pinned })

  const main = stripPinned(state.tree).filter(passesArchiveFilter)

  if (settings.sidebar.groupByRecency) {
    // Time-based bucketing across every non-pinned row (tabs + containers).
    const buckets: Record<'today' | 'yesterday' | 'earlier', SidebarNode[]> = {
      today: [],
      yesterday: [],
      earlier: []
    }
    for (const n of main) buckets[recencyBucket(maxActivityOf(n))].push(n)
    const labels: Record<'today' | 'yesterday' | 'earlier', string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier'
    }
    for (const key of ['today', 'yesterday', 'earlier'] as const) {
      if (buckets[key].length) {
        sections.push({ header: sectionLabel(labels[key]), nodes: buckets[key] })
      }
    }
    return sections
  }

  const freeTabs = main.filter((n) => n.kind === 'tab')
  const containers = main.filter((n) => n.kind !== 'tab')
  if (freeTabs.length) {
    sections.push({ header: sectionLabel(UITexts.Sidebar.sections.free), nodes: freeTabs })
  }

  const groupOf = (n: SidebarNode): string => (isContainer(n) ? n.group || '' : '')
  if (!containers.some((n) => groupOf(n))) {
    if (containers.length) sections.push({ nodes: containers })
    return sections
  }

  const groups = new Map<string, SidebarNode[]>()
  const order: string[] = []
  for (const n of containers) {
    const g = groupOf(n)
    if (!groups.has(g)) {
      groups.set(g, [])
      order.push(g)
    }
    groups.get(g)!.push(n)
  }
  for (const g of order.filter((x) => x)) {
    sections.push({ header: groupHeader(g), nodes: groups.get(g)! })
  }
  const ungrouped = groups.get('') ?? []
  if (ungrouped.length) sections.push({ header: groupHeader('Ungrouped', true), nodes: ungrouped })
  return sections
}
