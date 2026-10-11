// Solo la banda sonora: node tools/audio.mjs <full|vertical> <salida.wav>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [kind = 'full', out = join(root, 'out', 'audio_' + kind + '.wav')] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(pathToFileURL(join(root, 'dist', 'codigo-humano-t1-offline.html')).href + '?capture=' + kind);
await p.waitForFunction(() => window.CH && window.CH.captureReady);
writeFileSync(out, Buffer.from(await p.evaluate(() => window.CH.capture.audioWav()), 'base64'));
console.log(out); await b.close();
