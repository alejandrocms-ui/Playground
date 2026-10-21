# Raimondi · Horarios (MVP)

Aplicación integral y autónoma para crear, revisar, publicar y operar el horario escolar, pensada para la estructura del Colegio Raimondi (Primaria, Media y Liceo científico, lingüístico y artístico; docentes compartidos entre niveles; campanas distintas). Interfaz en **español e italiano**, con una experiencia visual inspirada en aSc Timetables.

> ⚠️ **Todos los datos incluidos son ficticios.** No contiene nombres reales, contratos ni registros del colegio.

## Qué hace

| Módulo | Para quién | Qué resuelve |
|---|---|---|
| **Importar planilla** | Coordinación | Suben una sola planilla Excel (campanas, secciones, materias ES/IT, docentes, carga por sección, reglas, compromisos). La app la valida antes de cambiar nada: errores con hoja y fila, avisos y diagnóstico de capacidad. Después carga los datos y genera la **primera pasada** del horario. |
| **Guía** | Todos | Guía integrada paso a paso (ES/IT) con enlaces a cada pantalla y preguntas frecuentes. |
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

## Flujo de trabajo del colegio

1. **Guía → Importar planilla → Descargar plantilla de ejemplo.** Es la misma estructura que espera el importador, con un colegio ficticio.
2. Rellenan las hojas (o exportan los datos actuales con **Exportar Excel** y los editan).
3. **Subir la planilla.** La app revisa todo sin aplicar nada: secciones con más horas que franjas, materias desconocidas, docentes escritos de dos formas, clases unidas y compromisos.
4. **Cargar y generar primera pasada.** El motor coloca todas las clases respetando las reglas obligatorias y reduce los huecos.
5. **Ajustes manuales** arrastrando clases, con el semáforo y la reorganización mínima. Cada cambio queda en el Historial.

Modelos que soporta la planilla y que existen en el colegio:
- **Campanas distintas por nivel**, comparadas en minutos reales (Inicial de 35 min, Primaria con pranzo a las 11:55, Media a las 12:40, Liceo a las 13:25, Artístico hasta las 17:15).
- **Clases unidas** (`unida_con`): la misma clase para varias secciones a la vez, como la Ed. Física de todo un año.
- **Grupos** (A/B): medias secciones en paralelo, como alemán y chino.
- **Co-docencia** (`Docente 1 / Docente 2`) y **compromisos fijos** (reuniones, vigilancia de recreo) que bloquean horas.

### Reglas pedagógicas de distribución

Están en el catálogo y se activan desde **Reglas** o desde la hoja *Reglas* de la planilla, por materia y/o sección:

| Regla | Tipo | Qué hace |
|---|---|---|
| `block_shape` — Agrupar horas en bloques | Estructural (obligatoria) | Por ejemplo, todo curso de 2 h en **un solo bloque** que nunca cruza un recreo, o Italiano de dos en dos (2+2+2+1). |
| `prefer_double_periods` — Preferir bloques de dos | Preferencia | Junta las horas sueltas en pares seguidos del mismo día cuando se puede. |
| `avoid_after_lunch` — Materias en la mañana | Preferencia | Evita las materias base (Matemática, Inglés, Italiano) después del almuerzo. El almuerzo se detecta solo en cada campana. |
| `balanced_distribution` — Distribución equitativa | Preferencia | Reparte cada curso entre los días y entre los **tres bloques del día** (antes de la pausa, antes del almuerzo, después). Las materias de la mañana se reparten solo entre los bloques de la mañana. |

El motor optimiza **por niveles de prioridad**: primero todas las preferencias de prioridad 1, que luego quedan congeladas, después las de prioridad 2 y al final las de prioridad 3. Así, muchas preferencias menores nunca "compran" una violación de una prioridad mayor.

### Datos reales (privados)

`data/private/` está ignorado por git. Si existe `data/private/seed_raimondi.json`, la app lo carga como semilla "Raimondi" (por ejemplo, el escenario generado desde la planilla del colegio). Ni los nombres reales ni los documentos del colegio se suben al repositorio.

Validación con los documentos 2026 del colegio (planes de estudio y distribución horaria): **62 secciones, 126 docentes, 894 lecciones y 2.622 horas semanales.** La primera pasada sale con **0 violaciones duras** (OPTIMAL en unos 10 s sin preferencias). Con la preferencia de huecos, el motor los reduce de 1.356 a ~400 en 4 minutos. Coherencia: con la Ed. Física en parejas, los dos docentes de EF suman 28 h cada uno, igual que su contrato.

## Arranque

```bash
cd raimondi-horarios
./run.sh                      # crea .venv, instala, libera el puerto, activa Claude si hay clave y abre el navegador
# o bien
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Al abrir por primera vez se carga la **escuela demo**: 14 secciones, 32 docentes, 353 clases y 445 horas semanales, ya resuelta con 0 violaciones duras. En *Historial → Cargar ejemplo* también están el fixture del handoff (4 secciones) y la regresión multicampana.

Variables opcionales:

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` (o archivo `.anthropic_key`, ignorado por git) | Activa el asistente con Claude (`claude-opus-5-5`; cambiar con `RAIMONDI_MODEL`). |
| `RAIMONDI_SECRET` | Clave para firmar los enlaces personales de docentes. **Cambiar en producción.** |
| `RAIMONDI_DB` | Ruta de la base SQLite de versiones (por defecto `data/raimondi.db`). |

## Pruebas

```bash
python -m pytest -q     # 33 pruebas: los 11 casos de aceptación del handoff + planilla, clases unidas, reglas de distribución, reemplazos, publicación y asistente
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
  spreadsheet.py   importación/exportación Excel (plantilla del colegio ⇄ esquema canónico) con informe de errores
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
