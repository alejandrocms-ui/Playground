// Prueba la interfaz en vivo: portada, reproducción, presentador, índice, formato vertical y celular.
import { chromium } from 'playwright';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'dist', 'codigo-humano-t1-offline.html')).href;
const out = join(root, 'out', 'ui'); (await import('node:fs')).mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function run(name, vp, fn) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  await p.goto(url); await p.waitForTimeout(1200);
  await fn(p); await p.close();
}
const shot = (p, n) => p.screenshot({ path: join(out, n + '.png') });
await run('desktop', { width: 1440, height: 810 }, async p => {
  await shot(p, '01_portada');
  await p.click('#ch-start'); await p.waitForTimeout(2500); await p.mouse.move(700, 400); await shot(p, '02_reproduciendo');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(5200); await shot(p, '03_presentador');
  await p.keyboard.press('Space'); await p.waitForTimeout(600); const a = await p.screenshot(); await p.waitForTimeout(800); const b2 = await p.screenshot();
  console.log('pausa congela presentador:', a.equals(b2));
  await p.keyboard.press('Space');
  await p.keyboard.press('i'); await p.waitForTimeout(400); await shot(p, '04_indice');
  await p.click('.ch-item[data-idx="9"]'); await p.waitForTimeout(5000); await shot(p, '05_indice_salto');
  await p.keyboard.press('t'); await p.waitForTimeout(1500); await p.mouse.move(600, 300); await shot(p, '06_vuelta_linea');
  const st = await p.evaluate(() => document.body.className); console.log('clase body tras T:', JSON.stringify(st));
  await p.keyboard.press('v'); await p.waitForTimeout(2000); await p.mouse.move(600, 320); await shot(p, '07_vertical_en_desktop');
});
await run('phone', { width: 390, height: 844 }, async p => {
  await shot(p, '08_tel_portada');
  await p.click('#ch-start'); await p.waitForTimeout(16000); await p.mouse.move(100, 100); await shot(p, '09_tel_episodio');
});
console.log(JSON.stringify({ errors }));
await b.close();
