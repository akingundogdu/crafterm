import { z } from 'zod'

// Project catalog sub-entities — mirror `Application`, `ProjectCommand`, and
// `Feature` in types.ts exactly (HR-1). These are owned by a project; in SQLite
// they become separate tables with a `projectId` FK (reference-by-id, §3.12),
// not nested arrays.

export const projectCommandSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string()
})

export const featureSchema = z.object({
  id: z.string(),
  name: z.string()
})

export const applicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  opensAs: z.enum(['tab', 'split']).optional(),
  commands: z.record(z.string(), z.string()), // environment name -> command
  runCommands: z.array(projectCommandSchema).optional()
})

export type ProjectCommand = z.infer<typeof projectCommandSchema>
export type Feature = z.infer<typeof featureSchema>
export type Application = z.infer<typeof applicationSchema>

export function makeApplication(p: Partial<Application> & Pick<Application, 'name'>): Application {
  return applicationSchema.parse({ id: crypto.randomUUID(), commands: {}, ...p })
}
export function makeFeature(name: string): Feature {
  return featureSchema.parse({ id: crypto.randomUUID(), name })
}
export function makeProjectCommand(
  p: Partial<ProjectCommand> & Pick<ProjectCommand, 'name' | 'command'>
): ProjectCommand {
  return projectCommandSchema.parse({ id: crypto.randomUUID(), ...p })
}
