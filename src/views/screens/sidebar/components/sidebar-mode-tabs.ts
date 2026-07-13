import type { SidebarMode } from '../sidebar.types'

// The terminal / notebook / database / docker / accounts mode tab buttons.
// `setSidebarMode` is owned by the shell (it flips the live `sidebarMode`).
export function wireModeTabs(setSidebarMode: (m: SidebarMode) => void): void {
  document.getElementById('tab-terminal')!.addEventListener('click', () => setSidebarMode('terminal'))
  document.getElementById('tab-notebook')!.addEventListener('click', () => setSidebarMode('notebook'))
  document.getElementById('tab-database')!.addEventListener('click', () => setSidebarMode('database'))
  document.getElementById('tab-docker')!.addEventListener('click', () => setSidebarMode('docker'))
  document.getElementById('tab-accounts')!.addEventListener('click', () => setSidebarMode('accounts'))
}
