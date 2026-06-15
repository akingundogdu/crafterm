import { z } from 'zod'

// Command-palette entry — mirrors `PaletteCommand` in types.ts exactly (HR-1).

export const paletteCommandSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  command: z.string()
})

export type PaletteCommand = z.infer<typeof paletteCommandSchema>

export function makePaletteCommand(
  p: Partial<PaletteCommand> & Pick<PaletteCommand, 'category' | 'name' | 'command'>
): PaletteCommand {
  return paletteCommandSchema.parse({ id: crypto.randomUUID(), ...p })
}
