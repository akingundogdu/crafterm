import { z } from 'zod'

// Per-project iOS worktree config — mirrors `IosDevConfig` in types.ts exactly
// (HR-1). Every field optional ('' = auto-detect inside ios-worktree.sh).

export const iosConfigSchema = z.object({
  project: z.string(),
  scheme: z.string(),
  baseBundleId: z.string(),
  displayPrefix: z.string(),
  defaultSimulator: z.string(),
  copyFiles: z.array(z.string()),
  worktreesDir: z.string()
})

export type IosConfig = z.infer<typeof iosConfigSchema>

export function makeIosConfig(p: Partial<IosConfig> = {}): IosConfig {
  return iosConfigSchema.parse({
    project: '',
    scheme: '',
    baseBundleId: '',
    displayPrefix: '',
    defaultSimulator: '',
    copyFiles: [],
    worktreesDir: '',
    ...p
  })
}
