# Raimondi · Horarios (MVP)

Aplicación integral y autónoma para crear, revisar, publicar y operar el horario escolar, pensada para la estructura del Colegio Raimondi (Primaria, Media y Liceo científico, lingüístico y artístico; docentes compartidos entre niveles; campanas distintas). Interfaz en **español e italiano**, con una experiencia visual inspirada en aSc Timetables.

> ⚠️ **Todos los datos incluidos son ficticios.** No contiene nombres reales, contratos ni registros del colegio.

## Qué hace

| Módulo | Para quién | Qué resuelve |
|---|---|---|
| **Panel de dirección** | Dirección / coordinación | Estado del horario (válido o con conflictos), problemas que bloquean, preferencias incumplidas, carga por docente (asignada, colocada, por día, huecos, días), carga por área y ocupación por sección. |
| **Horario** | Coordinación | Grilla por sección, docente o aula. Arrastrar y soltar con semáforo (verde / ámbar / rojo) y motivo exacto. Fijar o liberar clases, bandeja de clases sin colocar e impresión. |
| **Vista general** | Dirección | Matriz de todos los docentes, secciones o aulas a la vez, con choques reales en rojo. |
| **Datos y carga** | Coordinación | Alta, baja y cambio de docentes, secciones (con grupos A/B), materias (nombre ES/IT y área), áreas, aulas, timbres y lecciones (horas, bloques, docentes, aulas admitidas). Grilla de disponibilidad por docente (no disponible / guardia). Importar y exportar JSON/CSV. |
| **Reglas** | Coordinación | Catálogo cerrado de reglas, cada una marcada como **obligatoria** o **preferencia** con prioridad. Incluye diagnóstico previo. |
| **Motor** | — | CP-SAT (Google OR-Tools): respeta todas las reglas obligatorias y optimiza las preferencias. Con "Mover lo mínimo" cambia lo menos posible. Siempre entrega una **propuesta** con diferencias que se acepta o se descarta. |
| **Reemplazos** | Coordinación diaria | Registro de ausencias (solo categoría, sin datos personales), clases por cubrir y candidatos ordenados (guardia > misma materia > conoce la sección > misma área, con equidad de 30 días). Asignación automática de guardias y hoja imprimible del día. |
| **Profesores** | Cada docente | Enlace personal (sin cuenta) con su horario y sus reemplazos, calendario `.ics` y envío por correo. |
| **Historial** | Dirección | Cada cambio es una versión: comparar y restaurar exactamente. |
| **Asistente** | Coordinación | Instrucciones en ES/IT ("CN1 solo puede martes y jueves", "IT2 è assente domani"). Se convierten en una operación revisable que se confirma antes de aplicar. Sin clave API funciona en modo **Reglas (sin IA)**, etiquetado como tal. Con `ANTHROPIC_API_KEY` usa Claude. |

## Arranque

```bash
cd raimondi-horarios
./run.sh                      # instala dependencias y abre en http://localhost:8000
# o bien
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Al abrir por primera vez se carga la **escuela demo**: 14 secciones, 32 docentes, 353 clases y 445 horas semanales, ya resuelta con 0 violaciones duras. En *Historial → Cargar ejemplo* también están el fixture del handoff (4 secciones) y la regresión multicampana.

Variables opcionales:

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Activa el asistente con Claude (`claude-opus-5-5`; cambiar con `RAIMONDI_MODEL`). |
| `RAIMONDI_SECRET` | Clave para firmar los enlaces personales de docentes. **Cambiar en producción.** |
| `RAIMONDI_DB` | Ruta de la base SQLite de versiones (por defecto `data/raimondi.db`). |

## Pruebas

```bash
python -m pytest -q     # 45 pruebas: 21 originales y 24 de importación, datos inválidos y API
```

Los 11 casos de `demo_acceptance_spec.md` están en `tests/test_acceptance.py`: testigo 52/30, docente entre niveles, movimiento con doble choque y propuesta, preferencia de horas centrales, bloque que cruza el recreo, capacidad de chino 4 > 2, fijaciones contradictorias, UNKNOWN ≠ imposible, versión, comparación y deshacer exacto, exportación y reimportación, y solapamiento multicampana por minutos reales.

## Estructura

```
app/
  model.py         esquema canónico, ocurrencias, ventanas de bloque, recursos (docente/grupo/aula)
  rules.py         evaluación estática de reglas por franja (compartida por motor, validador y UI)
  solver.py        modelo CP-SAT, objetivo por prioridades, explicación de imposibilidad
  validator.py     validador independiente (duras, preferencias, carga, huecos)
  diagnostics.py   diagnóstico aritmético previo (capacidad, bloques, fijaciones)
  moves.py         comprobación incremental para arrastrar y soltar
  substitutions.py ausencias, candidatos, asignación
  assistant.py     intérprete ES/IT → operación cerrada (Claude o reglas)
  exports.py       JSON, CSV reimportable, iCalendar por docente
  store.py         versiones en SQLite
  main.py          API REST + archivos estáticos
static/            interfaz (HTML/CSS/JS sin compilación), i18n ES/IT, página del docente
data/              semillas ficticias (escuela demo, fixture del handoff, multicampana)
scripts/           generadores de semillas
docs/              buenas prácticas y arquitectura/escalabilidad
```

## Límites honestos del MVP

- **No es una integración con aSc.** CSV y JSON son exportaciones propias. Cualquier ida y vuelta con aSc se debe probar primero en una copia (ver `docs/ARQUITECTURA.md`).
- El motor demuestra optimalidad en instancias pequeñas. En la escuela demo entrega soluciones **válidas** (FEASIBLE) dentro del tiempo límite y lo dice.
- Las reglas de ejemplo (chino martes/jueves, horas troncales, viernes última hora, 28 horas) son **hipótesis para validar** con coordinación, no políticas confirmadas.
- La carga lectiva (`max_week`) está separada de apoyo, tutoría y permanencia. Antes de usar datos reales hay que acordar cómo se computa el contrato.
- Los enlaces de docente se firman con HMAC. Para producción conviene el SSO del colegio y HTTPS.

## Importar fuentes privadas del colegio

Usa `scripts/import_raimondi.py` para convertir JSON revisado o tablas CSV exportadas de Excel/Sheets al esquema canónico. Los escenarios e informes se guardan solo en `data/private/`, ignorado por git. Las fuentes incompletas quedan disponibles para revisión y bloquean la generación con `MODEL_INVALID`; no se declara imposibilidad sin datos suficientes. Consulta [el formato, las aprobaciones y los comandos](docs/IMPORTACION_PRIVADA.md). El ejemplo `data/import_example.json` es totalmente ficticio.
