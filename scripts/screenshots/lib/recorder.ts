import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { FRAMES_ROOT, IMAGES_DIR } from './paths.js'

// GIF recorder. Playwright cannot record video from Electron's hidden window, so a
// recording is a frame sequence: the spec drives the UI and calls frame()/hold()
// between micro-steps, then encode() hands the numbered PNGs to ffmpeg (palettegen
// + paletteuse, which is what keeps a 128-colour UI GIF from banding).

const FPS = 10
const WIDTH = 1280 // downscaled from the 1600px recording window — sharp on GitHub, fewer bytes
const MAX_BYTES = 3 * 1024 * 1024

export class Recorder {
  private count = 0
  private readonly dir: string

  constructor(
    private readonly page: Page,
    private readonly name: string
  ) {
    this.dir = join(FRAMES_ROOT, name)
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
    mkdirSync(IMAGES_DIR, { recursive: true })
  }

  // Capture n frames of the current view.
  async frame(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      const file = join(this.dir, String(++this.count).padStart(4, '0') + '.png')
      await this.page.screenshot({ path: file, animations: 'disabled' })
    }
  }

  // Hold the current view for ~ms of GIF playback (one frame per 1/FPS second).
  async hold(ms: number): Promise<void> {
    await this.frame(Math.max(1, Math.round((ms / 1000) * FPS)))
  }

  // Type into the focused element, capturing as it goes, so the GIF shows the text
  // appearing character by character rather than jumping in fully formed.
  async typeText(text: string, charsPerFrame = 2): Promise<void> {
    for (let i = 0; i < text.length; i++) {
      await this.page.keyboard.type(text[i])
      if (i % charsPerFrame === 0) await this.frame()
    }
    await this.frame()
  }

  // Run a real command in the focused terminal pane and record its output landing.
  async runCommand(text: string, settleMs = 1400): Promise<void> {
    await this.typeText(text, 3)
    await this.hold(300)
    await this.page.keyboard.press('Enter')
    await this.hold(settleMs)
  }

  // Encode the captured frames into docs/images/<name>.gif.
  encode(): string {
    if (this.count === 0) throw new Error(`recorder "${this.name}" captured no frames`)
    const out = join(IMAGES_DIR, `${this.name}.gif`)
    const filter =
      `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=max_colors=128:stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=bayer:bayer_scale=3`
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(this.dir, '%04d.png'), '-vf', filter, '-loop', '0', out],
      { stdio: 'inherit' }
    )
    const bytes = statSync(out).size
    const mb = (bytes / 1024 / 1024).toFixed(2)
    if (bytes > MAX_BYTES) {
      throw new Error(`${this.name}.gif is ${mb} MB — over the ${MAX_BYTES / 1024 / 1024} MB budget; shorten the recording`)
    }
    console.log(`  ${this.name}.gif — ${this.count} frames, ${mb} MB`)
    return out
  }

  // Keep one frame as a still (used where motion adds nothing).
  still(frameIndex = -1): string {
    const frames = readdirSync(this.dir).sort()
    if (!frames.length) throw new Error(`recorder "${this.name}" captured no frames`)
    const pick = frames.at(frameIndex) ?? frames[frames.length - 1]
    const out = join(IMAGES_DIR, `${this.name}.png`)
    copyFileSync(join(this.dir, pick), out)
    console.log(`  ${this.name}.png — still`)
    return out
  }
}

// A still screenshot with no GIF at all.
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(IMAGES_DIR, { recursive: true })
  const out = join(IMAGES_DIR, `${name}.png`)
  await page.screenshot({ path: out, animations: 'disabled' })
  console.log(`  ${name}.png — still`)
  return out
}
