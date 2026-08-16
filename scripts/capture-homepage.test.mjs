import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertUsableCapture,
  expectedSize,
  locales,
  minimumBytes,
  readPngHeader,
  resolveChrome,
  viewport,
} from './capture-homepage.mjs'

function pngOf(width, height, padding) {
  const buffer = Buffer.alloc(24 + padding)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

test('reads PNG dimensions and rejects non-PNG payloads', () => {
  assert.deepEqual(readPngHeader(pngOf(1280, 940, 0)), { width: 1280, height: 940 })
  assert.equal(readPngHeader(Buffer.from('<html>not an image</html>')), null)
})

test('accepts a full-size capture', () => {
  const { width, height } = expectedSize()
  assert.deepEqual(assertUsableCapture(pngOf(width, height, minimumBytes)), { width, height })
})

test('captures a taller frame than a letterbox crop', () => {
  // 1.7:1 read as squat in review; the frame is deliberately closer to a real window.
  assert.ok(viewport.width / viewport.height < 1.5, 'hero must not be a wide thin strip')
})

test('names a Chrome locale for each projection language', () => {
  assert.deepEqual(locales, { zh: 'zh-CN', en: 'en-US' })
})

test('refuses a capture that is not a PNG', () => {
  assert.throws(
    () => assertUsableCapture(Buffer.from('Chrome crashed')),
    /not a PNG/,
  )
})

test('refuses a capture whose viewport does not match', () => {
  assert.throws(
    () => assertUsableCapture(pngOf(800, 600, minimumBytes)),
    /is 800x600, expected 1280x940/,
  )
})

test('refuses a near-blank capture instead of publishing an outage', () => {
  // A site outage renders an almost-empty page, which compresses to a few KB.
  assert.throws(
    () => assertUsableCapture(pngOf(expectedSize().width, expectedSize().height, 1_000)),
    /rendered blank. Refusing to publish it/,
  )
})

test('reports every candidate when no Chrome binary is present', () => {
  assert.throws(
    () => resolveChrome(['no-such-chrome', 'also-missing'], () => ({ status: 127 })),
    /No Chrome binary found\. Tried: no-such-chrome, also-missing/,
  )
})

test('picks the first Chrome that answers --version', () => {
  const tried = []
  const chrome = resolveChrome(['missing-one', 'real-chrome'], binary => {
    tried.push(binary)
    return { status: binary === 'real-chrome' ? 0 : 127 }
  })
  assert.equal(chrome, 'real-chrome')
  assert.deepEqual(tried, ['missing-one', 'real-chrome'])
})
