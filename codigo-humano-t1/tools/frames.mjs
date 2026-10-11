// Muestra cuadros sueltos para revisión: node tools/frames.mjs <full|vertical> <salida> [t1 t2 ...]
// Sin tiempos, toma tres cuadros por escena (entrada, medio y asentado).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [kind = 'full', outDir = join(root, 'out', 'frames'), ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const W = kind === 'vertical' ? 1080 : 1920, H = kind === 'vertical' ? 1920 : 1080;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(join(root, 'dist', 'codigo-humano-t1-offline.html')).href + '?capture=' + kind);
await page.waitForFunction(() => window.CH && window.CH.captureReady, null, { timeout: 30000 });
const secs = await page.evaluate(() => window.CH.capture.sections);
let list = times.map(Number);
if (!list.length) secs.forEach(s => [.18, .5, .9].forEach(k => list.push(+(s.t0 + s.dur * k).toFixed(2))));
const canvas = await page.$('#ch-canvas');
for (const t of list) {
  const f = Math.round(t * 30);
  await page.evaluate(i => window.CH.capture.frame(i), f);
  const sec = secs.filter(s => s.t0 <= t).pop();
  const name = `${String(f).padStart(5, '0')}_${sec.type}${sec.id ? '_' + sec.id.slice(-3) : ''}.png`;
  writeFileSync(join(outDir, name), await canvas.screenshot());
}
console.log(JSON.stringify({ frames: list.length, duration: await page.evaluate(() => window.CH.capture.duration), errors }));
await browser.close();
