// @crafterm/ui — reusable, app-agnostic UI component library.
// Contract: each component is a factory `createX(opts)` that owns its DOM and
// cleanup, with no state/IPC/business-logic imports. Components reuse the app's
// existing CSS classes (co-located CSS lands in Phase 8). See
// docs/crafterm-ui-inventory.md.

// --- Modal stack ---
export { createButton, type ButtonOptions } from './button/button'
export { createInput, type InputOptions } from './input/input'
export { createTextarea, type TextareaOptions } from './textarea/textarea'
export { createField } from './field/field'
export { FormField, type FormFieldProps } from './form-field/form-field'
export { createSelect, CREATE_OPTION, type SelectOptions, type SelectOption } from './select/select'
export { createOverlay, type OverlayHandle } from './overlay/overlay'
export { createModal, type ModalOptions, type ModalHandle } from './modal/modal'

// --- Search ---
export { createSearchBox } from './search-box/search-box'

// --- Tree view ---
export {
  createTreeView,
  type DropPos,
  type TreeMenuItem,
  type TreeSection,
  type TreeAdapter,
  type TreeView
} from './treeview/treeview'

// --- Context menu ---
export {
  showContextMenu,
  closeContextMenu,
  NODE_PALETTE,
  type ContextMenuItem,
  type ColorOption
} from './context-menu/context-menu'

// --- Date picker ---
export { createDateField, type DateField, type DateFieldMode } from './datepicker/datepicker'
