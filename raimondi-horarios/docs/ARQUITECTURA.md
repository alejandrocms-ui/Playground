# Arquitectura y escalabilidad

## Flujo

```
Interfaz ES/IT ──► API REST (FastAPI) ──► Store versionado (SQLite: una instantánea JSON por versión)
   │  arrastrar → moves.check_slot (incremental, ms)
   │  generar   → diagnostics.precheck → solver (CP-SAT) → validator (independiente) → propuesta → aceptar = nueva versión
   │  asistente → assistant.interpret → operación cerrada → confirmación → mismos endpoints que la interfaz
   └  reemplazos → substitutions (ausencias, candidatos por niveles, registro)
```

Principios:

1. **Un solo modelo canónico** (`model.py`) interpreta los datos para motor, validador, interfaz y asistente. No hay dos verdades.
2. **El motor propone y la persona decide.** Nada del motor ni del asistente se escribe sin aceptación explícita, y todo queda versionado.
3. **El validador no confía en nadie:** recalcula desde las colocaciones.
4. **Catálogo cerrado de reglas.** Una regla nueva es código revisado (solver + validador + UI + i18n), nunca texto libre.

## Esquema canónico (JSON)

| Clave | Contenido |
|---|---|
| `meta` | nombre, año académico, zona horaria, inicio y fin de periodo, `synthetic` |
| `days`, `settings` | días del ciclo; `spread_lessons` (bloques de una lección en días distintos) |
| `bells[]` | `id`, `periods[{start,end}]` en minutos, `breaks[{start,end,crossing_allowed}]` |
| `areas[]`, `subjects[]` | nombres ES/IT, área peruana / italiana, color, `core` |
| `teachers[]` | `subject_ids`, `max_day`, `max_week` (horas lectivas), `cover_eligible`, `cover_duty[{day,start,end}]` |
| `sections[]` | nivel, itinerario, `bell_id`, `home_room`, `groups[]` |
| `rooms[]` | tipo |
| `lessons[]` | sección, materia, `teacher_ids` (co-docencia = todos ocupados), `blocks` (p. ej. `[2,1,1]`), `room_ids` admitidas, `group_id` |
| `constraints[]` | `id`, `type` (catálogo), parámetros, `hard`, `priority`, `enabled`, `note` (fuente / aprobación) |
| `placements[]` | `occ_id` (`<lesson>-<k>`), `day`, `period` de inicio, `room_id`, `locked` |
| `absences[]`, `substitutions[]` | fecha, docente, categoría; reemplazo asignado o "sin reemplazo" |

## Modelo del motor

- Una variable booleana por (bloque, día, hora de inicio, aula) que pase las reglas duras estáticas.
- `ExactlyOne` por bloque. No solapamiento por docente, grupo de alumnos y aula, **en minutos reales** (en cada inicio candidato, a lo sumo uno activo).
- Tope diario por docente, bloques de una lección en días distintos y máximo de días (con variables "día usado").
- Objetivo = Σ peso × (horas fuera de franja preferida, franjas a evitar, días usados, huecos del docente, cambios respecto al horario vigente).
- Estados: OPTIMAL / FEASIBLE / INFEASIBLE / UNKNOWN. Si es INFEASIBLE, una prueba por eliminación indica qué reglas desbloquean.

Rendimiento medido (8 hilos, contenedor de desarrollo): fixture de 4 secciones, OPTIMAL en 0,05 s; escuela demo de 14 secciones / 353 bloques / 12.734 variables, FEASIBLE con 0 duras y 0 huecos en 90 s. Una reorganización local tras un arrastre tarda unos 3 s.

## Escalar

| Etapa | Cambio |
|---|---|
| **Piloto Raimondi** (1 sede, ~40 secciones) | Igual que hoy. Subir el límite de tiempo a 2–5 min para la generación anual y usar "Mover lo mínimo" para los ajustes. Cargar los datos reales seudonimizados. |
| **Producción en el colegio** | Postgres en lugar de SQLite (misma tabla `versions` + tablas de auditoría), SSO Google/Microsoft del colegio con roles (dirección, coordinación, docente), HTTPS y copias de seguridad. Solver en una cola de trabajos (RQ/Celery) para no bloquear la API. |
| **Multicolegio (Adria Labs)** | Un `tenant_id` por colegio, catálogo de reglas por país (Perú/Italia), plantillas de plan de estudios y descomposición por nivel con recursos compartidos fijados (práctica 16). |
| **Integración aSc** | Solo tras la prueba de ida y vuelta del handoff: XML con `idprefix:RaimondiMVP`, IDs estables y fallo en cerrado ante campos no soportados. Hasta entonces: exportar propuestas legibles y aplicar a mano en aSc. |
| **Notificaciones** | Envío real por correo/WhatsApp de horarios y reemplazos (hoy: enlace + `.ics` + `mailto`). |

## Seguridad y privacidad

- Ausencias: solo categoría (salud, permiso, capacitación, otro), nunca diagnósticos.
- Los enlaces de docente son de solo lectura y van firmados con `RAIMONDI_SECRET`.
- El asistente con Claude solo envía el catálogo (IDs, nombres y materias) y la frase del usuario. No envía horarios, contratos ni datos de alumnos.
