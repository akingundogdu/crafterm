import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export function writeCounters(file: string, counters: Record<string, number>): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(counters))
  } catch {
    /* ignore */
  }
}
