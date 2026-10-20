# AGENTS.md — guía para agentes (Codex, Claude Code, etc.)

El proyecto principal de este repo es **`raimondi-horarios/`**: el MVP de horarios escolares del Colegio Raimondi (Lima), con interfaz bilingüe ES/IT. Antes de cambiar nada, lee `raimondi-horarios/README.md`, `raimondi-horarios/docs/ARQUITECTURA.md` y `raimondi-horarios/docs/BUENAS_PRACTICAS.md`.

`index.html` en la raíz es otro proyecto (dashboard electoral). No lo toques.

## Arrancar y probar

```bash
cd raimondi-horarios
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q                     # 21 pruebas; todas deben pasar antes de cada commit
uvicorn app.main:app --port 8000        # http://localhost:8000
python scripts/make_seed_school.py --time 90   # regenera la escuela demo (solo si cambias el generador o el modelo)
```

## Stack

- Backend: Python 3.10+, FastAPI y Google OR-Tools CP-SAT. Versiones guardadas en SQLite como instantáneas JSON.
- Frontend: HTML/CSS/JS sin compilación en `static/`. Cada texto visible lleva su clave en `static/i18n.js` **en `es` y en `it`**.
- Asistente: `app/assistant.py`. Usa Claude solo si existe `ANTHROPIC_API_KEY`; si no, un parser determinista etiquetado como "Reglas (sin IA)".

## Mapa del código

| Archivo | Responsabilidad |
|---|---|
| `app/model.py` | Esquema canónico, ocurrencias (`<lesson_id>-<k>`), ventanas de bloque, recursos (docente / grupo de sección / aula), catálogo `CONSTRAINT_TYPES` |
| `app/rules.py` | Evaluación estática de reglas por franja (la comparten motor, validador y UI) |
| `app/solver.py` | Modelo CP-SAT, objetivo por prioridades, explicación de imposibilidad por eliminación |
| `app/validator.py` | Validador independiente: duras, preferencias, carga, huecos |
| `app/diagnostics.py` | Diagnóstico aritmético previo (capacidad, bloques, fijaciones) |
| `app/moves.py` | Chequeo incremental para arrastrar y soltar |
| `app/substitutions.py` | Ausencias, candidatos a reemplazo, asignación |
| `app/exports.py` | JSON, CSV reimportable, `.ics` por docente |
| `app/store.py` | Versiones en SQLite |
| `app/main.py` | API REST (todas las rutas bajo `/api`) y archivos estáticos |
| `static/app.js` | SPA: panel, grilla, vista general, datos, reglas, reemplazos, publicación, historial, asistente |
| `tests/test_acceptance.py` | Los 11 casos de aceptación del handoff más reemplazos, publicación y mapa de franjas |

## Invariantes (no romper)

1. **Un solo modelo canónico.** Motor, validador, UI y asistente interpretan los datos con `build_ctx()`. No dupliques lógica de tiempos ni de recursos.
2. **Los choques se calculan en minutos reales**, no por número de hora (primaria 40 min, media/liceo 45 min, docentes compartidos).
3. **Duro ≠ preferencia.** Una regla dura nunca se relaja en silencio; las preferencias son términos ponderados (`PRIORITY_WEIGHT`).
4. **El validador no confía en el solver.** Toda propuesta pasa por `validate()` antes de aceptarse.
5. **El motor y el asistente proponen; la persona confirma.** Cada cambio aceptado crea una versión nueva (`store.commit`).
6. **Estados honestos:** UNKNOWN = "no concluyente", nunca "imposible"; FEASIBLE ≠ óptimo.
7. **Una regla nueva va en las cuatro capas:** `CONSTRAINT_TYPES` + `rules.py`/`solver.py` + `validator.py` + UI/i18n (ES e IT), con su prueba.
8. **Reemplazos:** una hora libre nunca habilita por sí sola. Solo cuentan la guardia (`cover_duty`) o `cover_eligible` con confirmación.
9. **Privacidad:** solo datos ficticios en el repo. Nada de nombres reales, contratos, datos de alumnos ni diagnósticos (las ausencias guardan solo la categoría).
10. **aSc:** no hay integración. No presentes CSV/JSON como ida y vuelta con aSc hasta probarlo en una copia del archivo real.

## Convenciones

- Código e identificadores en inglés; textos de UI y mensajes en ES/IT (`app/i18n.py` para el backend, `static/i18n.js` para el frontend).
- Antes de hacer push: `python -m pytest -q` en verde. Si cambias el modelo o el solver, regenera `data/seed_school.json` y verifica que quede con 0 violaciones duras.
- Commits pequeños y descriptivos. Trabaja en una rama propia y abre un PR; no hagas push directo a `main`.
