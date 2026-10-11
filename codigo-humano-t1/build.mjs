// Arma un solo HTML autocontenido (fuentes, logo y motor embebidos) en dist/.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = f => join(root, 'src', f);
const b64 = f => readFileSync(src(f)).toString('base64');

const fonts = [
  ['DM Serif Display', 'normal', 400, 'assets/dmserif.woff2'],
  ['DM Serif Display', 'italic', 400, 'assets/dmserif_it.woff2'],
  ['Space Grotesk', 'normal', '300 700', 'assets/grotesk.woff2'],
  ['JetBrains Mono', 'normal', 500, 'assets/mono.woff2']
].map(([fam, style, weight, file]) =>
  `@font-face{font-family:"${fam}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64(file)}) format("woff2");}`
).join('\n');

const engine = ['engine-core.js', 'engine-gens.js', 'engine-scenes.js', 'engine-music.js', 'app.js']
  .map(f => `/* ---- ${f} ---- */\n` + readFileSync(src(f), 'utf8')).join('\n');

let html = readFileSync(src('shell.html'), 'utf8');
html = html.replace('/*__DATA__*/', () => readFileSync(src('data.js'), 'utf8').trim())
  .replace('/*__FONTS__*/', () => fonts)
  .replace('/*__LOGO__*/', () => 'data:image/png;base64,' + b64('assets/logo.png'))
  .replace('/*__ENGINE__*/', () => engine);

const out = join(root, 'dist', 'codigo-humano-t1.html');
writeFileSync(out, html);
// versión para abrir sin conexión desde cualquier computadora o celular
const standalone = `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
writeFileSync(join(root, 'dist', 'codigo-humano-t1-offline.html'), standalone);
console.log('ok', out, (html.length / 1024).toFixed(0) + ' KB');
