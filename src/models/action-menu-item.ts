import { z } from 'zod'

// Sidebar actions (⋯) menu row — mirrors `ActionMenuItem` in types.ts exactly
// (HR-1). A `builtin` invokes a registered in-app action; a `command` runs a
// shell command in a terminal.

export const actionMenuItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['builtin', 'command']),
  builtinId: z.string().optional(),
  command: z.string().optional(),
  opensAs: z.enum(['split', 'tab']).optional(),
  hidden: z.boolean().optional()
})

export type ActionMenuItem = z.infer<typeof actionMenuItemSchema>
