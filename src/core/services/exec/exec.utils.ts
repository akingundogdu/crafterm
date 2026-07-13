import { existsSync } from 'fs'

// Resolve a CLI by probing well-known install paths first, since GUI-launched
// apps don't inherit the user's shell PATH. Falls back to the bare name (a PATH
// lookup may still succeed).
export function resolveBin(candidates: string[], fallback: string): string {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return fallback
}
