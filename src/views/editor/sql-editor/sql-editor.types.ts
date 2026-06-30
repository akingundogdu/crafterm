import type { DbEngine } from '@views/types/types'

// Per-model schema (table → columns), looked up by the shared completion
// provider so each pane suggests its own connection's objects.
export interface ModelSchema {
  tables: string[]
  columns: Record<string, string[]>
}

// Imperative handle returned by createSqlEditor.
export interface SqlEditor {
  getValue(): string
  setSchema(engine: DbEngine, schema: Record<string, string[]>): void
  setTheme(name: string): void
  focus(): void
  dispose(): void
}

export interface CreateSqlEditorOptions {
  parent: HTMLElement
  doc: string
  engine: DbEngine
  themeName?: string
  onRun: () => void
}
