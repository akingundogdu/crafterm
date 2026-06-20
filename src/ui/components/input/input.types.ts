// Text input primitive types.

export interface InputOptions {
  value?: string
  placeholder?: string
  type?: string // default 'text'
}

// Attributes resolved from InputOptions and bound by the view.
export interface InputViewProps {
  type: string
  value: string
  placeholder?: string
}
