// Multi-line text input primitive types.

export interface TextareaOptions {
  value?: string
  placeholder?: string
  rows?: number
}

// Attributes resolved from TextareaOptions and bound by the view.
export interface TextareaViewProps {
  value: string
  placeholder?: string
  rows?: number
}
