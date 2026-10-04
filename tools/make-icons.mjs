// Erzeugt die PWA-Icons aus public/icon.svg mit Playwright (Chromium-Screenshot).
// Aufruf: node tools/make-icons.mjs
// Falls Playwright nur global installiert ist: ln -sfn "$(npm root -g)/playwright" node_modules/playwright
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const BG = '#13131A';
const svg = fs.readFileSync(path.join(PUB, 'icon.svg'), 'utf8');

// Maskable-Variante: vollflächiger Hintergrund, Motiv auf 80 % der Kantenlänge; da das Motiv im SVG selbst Luft hat, bleibt rundum ein Sicherheitsrand von gut 20 %.
const html = (size, maskable) => {
  const inner = maskable ? Math.round(size * 0.8) : size;
  const off = Math.round((size - inner) / 2);
  const svgSrc = maskable ? svg.replace(/<rect[^>]*rx="112"[^>]*\/>/, '') : svg;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${BG};}
    #box{position:relative;width:${size}px;height:${size}px;background:${maskable ? BG : 'transparent'};overflow:hidden}
    #box svg{position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px;display:block}
  </style></head><body><div id="box">${svgSrc}</div></body></html>`;
};

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const browser = await pw.chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(html(t.size, t.maskable));
    const out = path.join(PUB, t.file);
    await page.locator('#box').screenshot({ path: out, omitBackground: !t.maskable, type: 'png' });
    await page.close();
    console.log('geschrieben:', path.relative(ROOT, out), pngSize(out));
  }
} finally {
  await browser.close();
}

// PNG-Header lesen: Breite und Höhe stehen im IHDR-Chunk (Byte 16..23).
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('kein PNG: ' + file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}
