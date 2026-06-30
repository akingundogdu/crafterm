// Shared form controls for the settings panels. Each per-tab panel module consumes
// these so the markup stays consistent across the settings screen. The
// implementations live in ./components; this module is a stable re-export shell.

export type { SubTab, SubTabsOptions } from './shared.types'
export { settingsCleanups, toHex6 } from './shared.state'
export { buildSubTabs } from './components/sub-tabs'
export { labeledInput } from './components/labeled-input-field'
export { labeledSelect } from './components/labeled-select-field'
