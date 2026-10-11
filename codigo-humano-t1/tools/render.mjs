// Exporta el video cuadro a cuadro (determinista, sin cuadros perdidos):
//   node tools/render.mjs full       → out/codigo-humano-t1_1080p30.mp4  (1920×1080)
//   node tools/render.mjs vertical   → out/codigo-humano-t1_vertical.mp4 (1080×1920)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kind = process.argv[2] === 'vertical' ? 'vertical' : 'full';
const outDir = join(root, 'out'); mkdirSync(outDir, { recursive: true });
const name = kind === 'vertical' ? 'codigo-humano-t1_vertical' : 'codigo-humano-t1_1080p30';
const W = kind === 'vertical' ? 1080 : 1920, H = kind === 'vertical' ? 1920 : 1080;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(join(root, 'dist', 'codigo-humano-t1-offline.html')).href + '?capture=' + kind);
await page.waitForFunction(() => window.CH && window.CH.captureReady, null, { timeout: 30000 });
const { duration, fps } = await page.evaluate(() => ({ duration: window.CH.capture.duration, fps: window.CH.capture.fps }));
const total = Math.round(duration * fps);

// 1) audio: la misma partitura, renderizada sin conexión
const wav = Buffer.from(await page.evaluate(() => window.CH.capture.audioWav()), 'base64');
const wavPath = join(outDir, name + '.wav'); writeFileSync(wavPath, wav);

// 2) video: cada cuadro se dibuja en su tiempo exacto y se manda a ffmpeg
const vidPath = join(outDir, name + '_video.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(fps), vidPath], { stdio: ['pipe', 'inherit', 'inherit'] });
const canvas = await page.$('#ch-canvas');
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate(n => window.CH.capture.frame(n), i);
  const png = await canvas.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log(`${kind}: cuadro ${i}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));
await browser.close();

// 3) unir audio y video
const final = join(outDir, name + '.mp4');
await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', vidPath, '-i', wavPath, '-map', '0:v', '-map', '1:a',
  '-vf', 'hqdn3d=1.2:1.2:5:5', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', kind === 'vertical' ? '9M' : '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-af', `afade=t=out:st=${(duration - 1.6).toFixed(2)}:d=1.6`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' })
  .on('close', c => c ? rej(new Error('mux ' + c)) : res()));
console.log(JSON.stringify({ final, frames: total, duration, errors, seconds: (Date.now() - t0) / 1000 }));
