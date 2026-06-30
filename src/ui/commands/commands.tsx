// Commands migrated to the gea tree (@views/commands). This legacy entry is a thin
// re-export so the remaining un-migrated @ui code keeps importing
// `@ui/commands/commands` until the shell migrates and src/ui is deleted (§10).
export * from '@views/commands/commands'
export type { GitAction, DropMode } from '@views/commands/commands.types'
