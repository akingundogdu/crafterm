// Modal prompts, rebuilt on the @crafterm/ui modal primitives. Same exported
// signatures, same DOM/classes, same behavior — callers are unchanged. Each
// prompt lives in its own module under ./components; this file re-exports them.
import './dialog.css'

export { makeCloseButton } from './components/dialog-close-button'
export { promptText } from './components/prompt-text'
export { promptConfirm } from './components/prompt-confirm'
export { promptCloseActions } from './components/prompt-close-actions'
export { promptSelect } from '@views/components/dialog/prompt-select'
export { promptForm } from './components/prompt-form'

export type {
  PromptTextOptions,
  PromptConfirmOptions,
  PromptCloseActionsOptions,
  CloseActionsResult,
  PromptSelectOptions,
  PromptFormOptions,
  FormField
} from './dialog.types'
