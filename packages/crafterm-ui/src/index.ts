// @crafterm/ui — reusable, app-agnostic UI component library.
// Contract: each component is a factory `createX(opts)` that owns its DOM and
// cleanup, with no state/IPC/business-logic imports. Components reuse the app's
// existing CSS classes (co-located CSS lands in Phase 8). See
// docs/crafterm-ui-inventory.md.

export { createButton, type ButtonOptions } from './button/button'
export { createInput, type InputOptions } from './input/input'
export { createField } from './field/field'
export { createSelect, CREATE_OPTION, type SelectOptions } from './select/select'
export { createOverlay, type OverlayHandle } from './overlay/overlay'
export { createModal, type ModalOptions, type ModalHandle } from './modal/modal'
