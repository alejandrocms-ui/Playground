# Cooper Compass · MVP de demo

> Cada estudiante, su propio norte.

Dashboard de orientación vocacional que junta universidades de Perú, EE. UU. y el Reino Unido, carreras, modalidades de ingreso, becas e idiomas, y los cruza con el perfil de cada estudiante. Es una **demo** de Adria Labs para la sesión 1 del programa «Tu Sistema Personal de IA».

- Todo corre en el navegador: sin backend, sin inicio de sesión, sin APIs de pago.
- Los cambios de la demo se guardan en `localStorage`. El botón **«Restablecer demo»** (barra lateral) vuelve todo al estado inicial.
- **Los seis estudiantes son 100 % ficticios** y llevan la etiqueta «Perfil ficticio».

## Cómo correrlo

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # build de producción en dist/
npm run preview    # sirve dist/ en http://localhost:4173 (funciona sin internet)
SINGLE=1 npx vite build   # un solo archivo autocontenido en dist-single/index.html
```

`dist-single/index.html` incluye tipografías, datos y código. Se abre con doble clic, sin internet.

## Cómo editar los datos

Todo está en `src/data/*.json`:

| Archivo | Contenido |
|---|---|
| `sources.json` | Cada fuente: entidad, título, URL, fecha de consulta (`checked_at`, o `null` si aún no se consultó) y estado |
| `institutions.json` | 8 universidades de Perú y 8 de EE. UU. |
| `programs.json` | Carreras por universidad, con código RIASEC |
| `admission_modes.json` | Modalidades de ingreso, requisitos y próximas fechas |
| `scholarships.json` | Becas y políticas de ayuda institucional |
| `credentials.json` | Exámenes de idioma y de admisión |
| `students_demo.json` | Estudiantes ficticios de la demo |

Todo dato institucional va como `Fact`: `{ "value": ..., "source_id": "...", "status": "verificado" | "por_verificar", "note": "..." }`. Si no hay dato oficial, `value` es `null` y la interfaz muestra «Por verificar». **Nunca inventes fechas, montos, puntajes ni requisitos.**

Después de editar un JSON, `Restablecer demo` (o borrar el `localStorage` del sitio) carga los nuevos datos de estudiantes.

## Cálculo de coincidencia

Toda la lógica está comentada en `src/lib/matching.ts`. Son cinco factores: afinidad RIASEC, interés declarado, idioma, costo y ayudas, ubicación y nivel. Sus pesos son 30 · 25 · 20 · 15 · 10 según el orden de «Lo que más le importa». Si un dato no está verificado, el factor queda neutro y aparece en «Qué falta revisar». La app nunca decide elegibilidad.

Cambio respecto del HANDOFF: la lista «Lo que más le importa» usa los cinco factores reales del cálculo. El HANDOFF mencionaba «duración», que no forma parte del cálculo.

## Estado de verificación (4 de noviembre de 2026)

- **Fuentes:** 77 registradas · 38 verificadas · 39 por verificar.
- **Datos (`Fact`):** 52 verificados · 211 por verificar.
- **Verificado a fondo (ruta de la demo):** Beca Generación del Bicentenario (convocatoria extraordinaria 30/10–13/11/2026), Beca 18 (Convocatoria 2027), Beca de Posgrado Fulbright (cobertura, requisitos e idioma; la fecha de cierre sigue por verificar), Humphrey (requisito), MIT (need-blind, SAT/ACT, plazos y ayuda), Purdue y ASU (requisitos de inglés), PUCP y UNI (modalidades de ingreso) y Open Doors. Desde el 5 de noviembre de 2026 incluye la London School of Economics (LSE) con todos sus requisitos para escolares del Perú: ruta académica, postulación por UCAS, exámenes por programa, ruta de colegios americanos, visa de estudiante, costos y apoyo financiero.
- **Método:** las páginas oficiales se consultaron con búsquedas restringidas a cada dominio oficial (gob.pe, pronabec.gob.pe, fulbright.pe, mitadmissions.org, purdue.edu, asu.edu, pucp.edu.pe, uni.edu.pe). La descarga directa de páginas estaba bloqueada en el entorno de trabajo, así que conviene revisar los datos verificados en el sitio oficial antes de asesorar.
- **Open Doors:** no se encontró una ficha de Perú 2025; se usa la de 2024 (año 2023/24).
- **Pendiente:** costos publicados de todas las universidades, licenciamiento SUNEDU, duración de carreras, formato y vigencia de exámenes, OEA, EducationUSA y Harvard.

## Brújula IA (asistente conversacional)

Botón «Brújula IA» abajo a la derecha (o Ctrl+K / Cmd+K). Usa la capacidad `sample` de los Artifacts de claude.ai: responde con la cuenta de Claude de quien abre la página, sin backend ni claves de API. La primera vez, Claude pide permiso.

- **Lee los datos con herramientas de la página** (`src/lib/assistantTools.ts`): buscar en el catálogo, ver la ficha de una universidad, carrera o beca con sus fuentes, listar estudiantes, ver un perfil con sus coincidencias y ver las próximas fechas.
- **Actúa en la interfaz:** abre pantallas y aplica filtros en Explorar.
- **Propone cambios, no los ejecuta:** agregar a la lista corta, mover de etapa, agregar notas, reordenar prioridades y crear estudiantes ficticios. Cada propuesta aparece con «Aplicar» o «Descartar».
- **Reglas fijas:** solo usa datos de sus herramientas, dice «Por verificar» cuando falta un dato, nunca decide elegibilidad y nunca pide datos personales reales.
- **Modos:** «Rápido» responde en segundos; «Profundo» da respuestas más elaboradas y tarda más.
- **Fuera de claude.ai** (archivo local o `npm run preview`) el asistente muestra un aviso y el resto del dashboard funciona igual.

## Accesibilidad

- El contraste de texto llega a AA. Los tonos de marca (dorado, teal, coral) se usan como relleno; para texto se usan sus versiones `-ink`.
- Arrastrar y soltar funciona con mouse, pantalla táctil y teclado: espacio o Enter para tomar, flechas para mover, espacio para soltar y Esc para cancelar.
- En Explorar, cada acción de arrastre también tiene un botón: «+» para agregar un filtro, «×» para quitarlo y el selector «Agregar a lista corta de…».
- Las tarjetas del tablero de etapas se mueven entre columnas con ← y →.

## Hacia la sesión 3

Ver la sección 15 del HANDOFF: Google Sheets, alertas por correo, informe PDF por estudiante, dos usuarias, datos reales con consentimiento (Ley N.º 29733) y actualización periódica de fuentes.

---

Información orientativa. Verifica siempre en la fuente oficial antes de asesorar.
