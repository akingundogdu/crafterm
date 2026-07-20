import { join } from 'node:path'

// Every path the screenshot generator touches. The demo workspace deliberately
// lives under a short, neutral root: its absolute path is visible in terminal
// prompts, the status bar and the file explorer, so it must never expose the
// developer's home directory.
// Playwright transpiles these specs to CJS, so the repo root comes from the run
// directory (`npm run screenshots` always runs at the repo root) rather than
// import.meta.
export const REPO_ROOT = process.cwd()
export const IMAGES_DIR = join(REPO_ROOT, 'docs', 'images')
export const SCRIPTS_DIR = join(REPO_ROOT, 'scripts', 'screenshots')

// Throwaway workspace: demo repos, the app's state dir, stub CLIs and raw frames.
export const DEMO_ROOT = '/tmp/crafterm-demo'
export const FRAMES_ROOT = join(DEMO_ROOT, 'frames')

// Guard against ever pointing the app at the real ~/.crafterm (HR-5).
export function assertThrowaway(dir: string): string {
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error(`refusing real state dir: ${dir}`)
  return dir
}
