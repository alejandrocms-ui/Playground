# Importación documental privada

El importador transforma fuentes revisadas a **un único escenario canónico**. No interpreta PDFs con IA, no accede a Google Drive, no conecta aSc y no envía información a servicios externos. Los PDF se transcriben y cotejan primero a JSON o a tablas CSV; los originales se conservan fuera del repositorio.

## Ejecución local

Desde `raimondi-horarios`, con las dependencias instaladas:

```bash
source .venv/bin/activate
python scripts/import_raimondi.py data/private/source_raimondi.json --time 30
python -m pytest -q
```

El importador escribe exclusivamente dentro de `data/private/`:

- `seed_raimondi.json`: escenario sin colocaciones, listo para revisión documental.
- `import_report.json`: resultados íntegros del validador independiente, diagnóstico y solver; incluye validación de una solución si se encontró. Una propuesta nunca se aplica al escenario.

Código de salida: **0** si se encontró una solución validada; **2** si se guardó un escenario sin solución validada (incluye entrada incompleta, imposibilidad o tiempo no concluyente); **1** si el formato o las rutas se rechazaron. Revisar siempre `solver.status`: la salida 2 por sí sola no significa imposibilidad. Una entrada malformada no reemplaza los artefactos existentes.

Para probar el flujo con datos ficticios:

```bash
python scripts/import_raimondi.py data/import_example.json \
  --output data/private/example_scenario.json \
  --report data/private/example_report.json
```

`data/import_example.json` es completamente sintético. No contiene estructura, nombres ni cargas reales.

## Formato de fuentes

Un objeto JSON contiene `meta`, `sources`, `days`, `settings` y las tablas canónicas `areas`, `subjects`, `teachers`, `sections`, `rooms`, `bells`, `lessons`, `constraints`. Véase el ejemplo completo. Además admite:

| Campo | Uso |
|---|---|
| `sources[]` | IDs únicos, título, año y opcionalmente hash/ruta local del documento. |
| `source_ref` en cada registro | ID de fuente con localizador opcional, p. ej. `S1#page=2/row=4`. |
| `aliases[]` | Equivalencia explícita `{alias, teacher_id, source_ref, confirmed, approval}`; usar alias con ámbito de documento, no códigos globales. |
| `lessons[].teacher_aliases` | Se resuelven a `teacher_ids`; un alias desconocido bloquea. No se realizan coincidencias aproximadas. |
| `sections[].weekly_total` | Total de control por alumno. Se contrasta con la suma del plan, incluyendo grupos cuando existen. |
| `calendar_review`, `coverage_review` | Ratificación explícita del calendario/política de bloques y de la cobertura completa de entidades/asignaciones para el año objetivo. |
| `confirmed` y `approval` | `confirmed: true` más `approval: {by, academic_year}` y fuente válida. El año debe coincidir con `meta.academic_year`. No se autocompletan aprobaciones. |
| `workloads[]` | Componentes documentales de carga. `teaching`, `support`, `permanence`, `reported_total` permiten detectar diferencias aritméticas; nunca se convierten automáticamente en `max_week`. |
| `open_issues[]` | `{code, entity, detail, resolved}`. Los asuntos no resueltos bloquean la generación. |

También se admite una **carpeta de CSV**, exportada manualmente de Excel o Google Sheets: `manifest.json` contiene metadatos, fuentes, días y revisiones; cada tabla va en `<tabla>.csv`, UTF-8 con o sin BOM. No se admite repetir una tabla en manifest y CSV. Los campos de lista/objeto, números y booleanos se escriben como JSON dentro de la celda: `["T1"]`, `[2,1]`, `true`, `{"by":"...","academic_year":2027}`. Los campos vacíos se omiten. Se rechazan IDs/cabeceras duplicados, referencias inválidas críticas, horas negativas y booleanos ambiguos. No se lee `.xlsx` directamente: exportar cada pestaña a CSV.

La persona que transcribe debe conservar las alternativas de las fuentes en `open_issues`; una celda con dos nombres no demuestra codocencia. Para codocencia se requiere `assignment_mode: "co_teaching"` y aprobación del registro. Para grupos se usan `sections[].groups` y `lessons[].group_id`; la alternancia debe modelarse explícitamente antes de resolver.

## Datos incompletos y reglas

La falta de campanas reales, aulas, bloques, identidades, ratificación del calendario o cobertura completa produce asuntos en `meta.import_audit.blockers`. Los bloques unitarios provisionales sirven para representar el plan, **no autorizan generar**. Un escenario bloqueado se abre para revisión en la UI existente, pero el modelo compartido, el diagnóstico y el solver detienen la generación con `MODEL_INVALID`. La validación devuelve `valid: false`. Cero ocurrencias derivadas en ese estado no significa cero clases: el informe separa `source_totals` de la cobertura del motor.

Las reglas reconocidas sin aprobación se marcan como **preferencias** (`hard: false`) con fuente y nota. Una regla fuera del catálogo bloquea la importación: añadirla exige las cuatro capas y su prueba, según `AGENTS.md`. Las notas ambiguas que todavía no tienen parámetros suficientes deben conservarse como asuntos o preferencias candidatas desactivadas, sin inventar días o franjas.

Los topes docentes sin ratificar quedan en `reported_limits`; no se imponen como restricciones. La habilitación de reemplazos sin aprobación se desactiva. Separar horas lectivas de apoyo, permanencia y roles tutoriales; el total contractual no es una capacidad lectiva universal.

Para resolver los pendientes, corregir y ratificar las fuentes y volver a ejecutar el importador. La UI no elimina automáticamente el bloqueo documental al editar una entidad. No borrar `import_audit` para forzar una solución. La aprobación documentada no constituye un sistema de permisos criptográficos: este MVP es local y operado por personas de confianza.

## Privacidad y límites

No añadir al commit fuentes, transcripciones, escenarios, informes ni capturas con datos reales. La carpeta privada y `.venv/` están ignoradas por git. Revisar siempre el diff preparado antes de publicar. `meta.import_audit` y las exportaciones JSON contienen evidencia privada; mantenerlas locales. Los hashes acreditan qué archivo se importó, no que la transcripción o las aprobaciones sean correctas.

La semilla privada se carga automáticamente solo si la base de datos local está vacía; con una base existente se selecciona «raimondi» desde Historial. Al arrancar con datos privados, mantener el servicio en `127.0.0.1` y el asistente sin credenciales externas. No se han añadido envío de horarios, integración aSc ni un modelo de IA de producción.
