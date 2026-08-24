#!/usr/bin/env node

// Captures the deepseek1024.com homepage for the README hero image.
//
// Runs on the plain headless Chrome that ships with the GitHub ubuntu runners
// (and with a local Chrome install), so it needs no Playwright/Puppeteer download.
// The capture is validated before it is published: a site outage or a render
// failure produces a near-blank PNG, and shipping that would be worse than
// keeping the previous screenshot.

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const defaultUrl = 'https://deepseek1024.com/'
// GitHub renders README images into a ~1000 px column, so 1280 wide at 1x is already
// slightly downscaled there — more pixels only cost bytes. The height is what matters:
// a 760 px viewport crops to a squat 1.7:1 letterbox, so it is taller than the window
// a visitor would use, which also gets more of the ranking list into the frame.
export const viewport = { width: 1280, height: 940 }
export const scale = 1
// The site picks its language from navigator.language (apps/web/src/lib/i18n.tsx
// in the dsh-1024store repository), which is en-US on a CI runner. Each projection
// gets a capture in its own language.
export const locales = { zh: 'zh-CN', en: 'en-US' }
// A blank or error page compresses to a few KB at this size; a real render of the
// homepage is ~150 KB. The threshold only has to separate those two orders.
export const minimumBytes = 30_000

const candidateBinaries = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(value => typeof value === 'string' && value.length > 0)

export function resolveChrome(candidates = candidateBinaries, run = spawnSync) {
  for (const binary of candidates) {
    const probe = run(binary, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return binary
  }
  throw new Error(
    `No Chrome binary found. Tried: ${candidates.join(', ')}. Set CHROME_PATH to override.`,
  )
}

export function readPngHeader(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export function expectedSize(density = scale) {
  return { width: viewport.width * density, height: viewport.height * density }
}

export function assertUsableCapture(buffer, expected = expectedSize()) {
  const header = readPngHeader(buffer)
  if (header === null) throw new Error('Capture is not a PNG; Chrome likely failed to start.')
  if (header.width !== expected.width || header.height !== expected.height) {
    throw new Error(
      `Capture is ${header.width}x${header.height}, expected ${expected.width}x${expected.height}.`,
    )
  }
  if (buffer.length < minimumBytes) {
    throw new Error(
      `Capture is only ${buffer.length} bytes (minimum ${minimumBytes}); the page probably rendered blank. Refusing to publish it.`,
    )
  }
  return header
}

export async function captureHomepage({ url = defaultUrl, out, lang = locales.zh, chrome, run = spawnSync } = {}) {
  const binary = chrome ?? resolveChrome(undefined, run)
  const profile = await mkdtemp(path.join(os.tmpdir(), 'dsh-shot-'))
  try {
    const result = run(binary, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      `--lang=${lang}`,
      `--accept-lang=${lang}`,
      `--force-device-scale-factor=${scale}`,
      '--virtual-time-budget=10000',
      `--window-size=${viewport.width},${viewport.height}`,
      `--screenshot=${out}`,
      url,
    ], { encoding: 'utf8', timeout: 60_000 })
    // Chrome writes the PNG when the virtual-time budget expires but can then linger,
    // holding the page's live connection open until it is killed. The capture is what
    // matters, so the exit status is only reported when no usable file was produced.
    const buffer = await readFile(out).catch(() => null)
    if (buffer === null) {
      throw new Error(`Chrome produced no screenshot (exit ${result.status}): ${result.stderr ?? ''}`.trim())
    }
    const header = assertUsableCapture(buffer)
    return { bytes: buffer.length, ...header }
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
}

function parseArguments(argv) {
  const options = { url: defaultUrl }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = () => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${argument} requires a value`)
      index += 1
      return next
    }
    if (argument === '--out') options.out = path.resolve(value())
    else if (argument === '--url') options.url = value()
    else if (argument === '--lang') options.lang = value()
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (options.out === undefined) throw new Error('--out <file.png> is required')
  return options
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const info = await captureHomepage(options)
    console.log(`Captured ${options.url} → ${options.out} (${info.width}x${info.height}, ${info.bytes} bytes)`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
