# Código Humano · Temporada 1 — pieza animada

La historia de cada episodio de la temporada 1 en una sola pieza: apertura en frío, título, una escena generativa por episodio, montaje de invitados y cierre con la tesis del programa. Música original sintetizada en el navegador (100 BPM, tres movimientos: construcción, respiro y clímax).

## Entregables

| Archivo | Qué es |
|---|---|
| `dist/codigo-humano-t1-offline.html` | La pieza interactiva, 100 % sin conexión: fuentes, logo, música y motor van adentro. Funciona en proyector y en celular. |
| `dist/codigo-humano-t1.html` | La misma pieza, en el formato que se publica como página. |
| `out/codigo-humano-t1_1080p30.mp4` | Video 1920×1080, 30 cuadros por segundo, 1:46. |
| `out/codigo-humano-t1_vertical.mp4` | Corte vertical 1080×1920 de 41 s para Instagram, TikTok y LinkedIn. |

## Presentar en vivo

- **Reproducir**: la pieza corre en bucle.
- **Modo presentador**: `→` / `←` saltan a la escena siguiente o anterior. Cada escena entra y luego queda "respirando" (movimiento suave en bucle) mientras hablas. `T` vuelve a la línea de tiempo desde esa escena.
- `Espacio` pausa · `F` pantalla completa · `I` índice · `M` sonido · `V` alterna horizontal y vertical · `1`–`9` y `0` saltan al episodio.
- En el celular: tocar pausa; deslizar a los lados cambia de escena en modo presentador.
- El índice y las marcas de la barra de progreso son clicables.

## Sumar un episodio

1. Abre `src/data.js` (o el bloque `<script id="ch-data">` al inicio del HTML final).
2. Copia una fila de `episodios` y cambia sus datos. Las palabras entre `*asteriscos*` se destacan en violeta.
3. Elige una `escena`: `huella`, `compuerta`, `documento`, `rompecabezas`, `red`, `radar`, `bote`, `mente`, `ficha`, `brote`, o `ondas` (genérica).
4. `node build.mjs`. La línea de tiempo, la música, el índice y el progreso se recalculan solos.

## Volver a exportar los videos

Requiere Node 22, Playwright con Chromium y ffmpeg.

```bash
node build.mjs
node tools/render.mjs full       # MP4 1080p30
node tools/render.mjs vertical   # MP4 9:16
node tools/frames.mjs full out/frames && python3 tools/contact.py out/frames out/contact.jpg   # hoja de contactos
```

Cada cuadro se dibuja en su tiempo exacto (`render(t)` es una función pura del tiempo), así que el video es determinista y no pierde cuadros. El audio sale de la misma partitura, renderizado sin conexión.

## Estructura

- `src/data.js` — contenido editable.
- `src/engine-core.js` — línea de tiempo, cámara, fondo con profundidad, texto cinético, formas de onda.
- `src/engine-gens.js` — las escenas generativas de cada episodio.
- `src/engine-scenes.js` — composición de escenas, transiciones (onda, corchete, iris) y render.
- `src/engine-music.js` — partitura y síntesis (Web Audio), exportación WAV.
- `src/app.js` — interfaz: reproducción, presentador, índice, teclado, toque.
