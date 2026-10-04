// Prüft die PWA-Dateien: Manifest, Icons (PNG-IHDR) und Service Worker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUB = path.join(ROOT, 'public')

function pngSize(file) {
  const b = fs.readFileSync(file)
  assert.equal(b.readUInt32BE(0), 0x89504e47, `${file} ist kein PNG`)
  assert.equal(b.toString('ascii', 12, 16), 'IHDR', `${file}: IHDR fehlt`)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8'))

test('manifest.json hat die Pflichtfelder', () => {
  assert.equal(manifest.name, 'Wochenplan')
  assert.equal(manifest.short_name, 'Wochenplan')
  assert.equal(manifest.lang, 'de')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.orientation, 'portrait')
  assert.equal(manifest.background_color, '#13131A')
  assert.equal(manifest.theme_color, '#13131A')
  assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0)
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3)
  const purposes = new Set(manifest.icons.map(i => i.purpose))
  assert.ok(purposes.has('any') && purposes.has('maskable'))
})

test('Icon-Dateien existieren und haben die im Manifest genannten Größen', () => {
  for (const icon of manifest.icons) {
    const file = path.join(PUB, icon.src.replace(/^\//, ''))
    assert.ok(fs.existsSync(file), `${icon.src} fehlt`)
    assert.equal(icon.type, 'image/png')
    const [w, h] = icon.sizes.split('x').map(Number)
    const got = pngSize(file)
    assert.deepEqual(got, { w, h }, `${icon.src}: erwartet ${icon.sizes}, gefunden ${got.w}x${got.h}`)
  }
  assert.ok(fs.existsSync(path.join(PUB, 'icon.svg')), 'icon.svg fehlt')
})

test('sw.js enthält keine Referenz auf firebase und nutzt den Cache-Namen wochenplan-v2', () => {
  const sw = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8')
  assert.ok(!/firebase/i.test(sw), 'sw.js darf firebase nicht referenzieren')
  assert.ok(sw.includes('"wochenplan-v2"'))
  assert.ok(sw.includes('/assets/'))
  assert.ok(sw.includes('navigate'))
})

test('index.html verweist auf Manifest, Icons und theme-color', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  assert.ok(html.includes('<title>Wochenplan</title>'))
  assert.ok(html.includes('rel="manifest" href="/manifest.json"'))
  assert.ok(html.includes('name="theme-color" content="#13131A"'))
  assert.ok(html.includes('rel="apple-touch-icon"'))
  assert.ok(html.includes('href="/icon.svg"') && html.includes('href="/icon-192.png"'))
})

test('Service Worker wird nur im Produktions-Build registriert', () => {
  const pwa = fs.readFileSync(path.join(ROOT, 'src', 'pwa.js'), 'utf8')
  assert.ok(pwa.includes('import.meta.env.PROD'))
  assert.ok(pwa.includes("'serviceWorker' in navigator"))
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.jsx'), 'utf8')
  assert.ok(main.includes("import { registerSW } from './pwa'") && main.includes('registerSW()'))
})
