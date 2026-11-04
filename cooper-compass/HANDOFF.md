# HANDOFF PARA CLAUDE CODE · Cooper Compass

**Proyecto:** MVP (producto mínimo viable: la primera versión funcional) de un dashboard de orientación vocacional.
**Preparado por:** Alejandro Castro-Mendivil · Adria Labs · 4 de noviembre de 2026, hora de Lima.
**Demo:** hoy, miércoles 4 de noviembre de 2026, 18:00 (hora de Lima), por pantalla compartida en Google Meet.

---

## 0. Cómo usar este archivo

1. Crea una carpeta vacía, por ejemplo `cooper-compass`.
2. Guarda este archivo dentro de la carpeta con el nombre `HANDOFF.md`.
3. Abre Claude Code en esa carpeta.
4. Pega el mensaje de la sección 17 como primer mensaje.

Claude Code: lee todo el archivo antes de escribir código. Si una instrucción choca con otra, manda la sección 3 (restricciones).

---

## 1. Contexto

### Quién lo pide y para qué

Alejandro dicta un programa de tres sesiones llamado «Tu Sistema Personal de IA». Las alumnas son una asesora de orientación vocacional y su colega. Ambas trabajan en el mismo negocio.

- **Sesión 1 (hoy):** panorama de la IA y configuración personal en Claude. Al final, Alejandro quiere mostrar este dashboard como **gancho**: «así podría verse el sistema que vamos a construir».
- **Sesión 3:** construyen la versión real, con sus datos y su forma de trabajar.

Por eso el MVP de hoy es una **demo**. Tiene que verse terminada, funcionar sin errores y despertar ganas. No tiene que ser completa.

### El negocio de la clienta

- Orientación vocacional para estudiantes.
- Asesoría para estudiar en el exterior, sobre todo en Estados Unidos.
- Búsqueda de becas.

### El problema que resuelve

Hoy la información está dispersa en decenas de páginas, PDF y hojas de cálculo. Para asesorar a un solo estudiante, la asesora tiene que juntar a mano:

- becas;
- universidades y su acceso;
- carreras que ofrece cada universidad;
- modalidades de ingreso;
- requisitos y documentos;
- exámenes y certificaciones de idioma (inglés y otros);
- costos y ayudas;
- lo que el estudiante quiere, sabe hacer y busca en la vida.

**Cooper Compass** junta todo eso en un solo lugar y lo cruza con el perfil de cada estudiante.

### Dato de contexto para la pantalla de inicio

Según Open Doors (el informe anual del Institute of International Education sobre estudiantes internacionales en EE. UU.), en el año académico 2023/24 había **5.505 estudiantes peruanos en EE. UU.**:

- 45,5 % en pregrado;
- 32,9 % en posgrado;
- 16,7 % en OPT (Optional Practical Training: el permiso de práctica laboral después de estudiar);
- 4,9 % en programas sin grado.

Fuente: [Open Doors Fact Sheet Peru 2024](https://opendoorsdata.org/wp-content/uploads/2024/12/OpenDoors_FactSheet_Peru_2024.pdf). Claude Code: busca si ya existe la ficha de Perú de 2025. Si existe, usa la más reciente y registra la fecha de consulta.

---

## 2. Objetivo de la demo y criterio de éxito

En **3 minutos de pantalla compartida**, la clienta tiene que ver cuatro cosas:

1. **Todo en un solo lugar.** Universidades de Perú y de EE. UU., carreras, ingreso, becas e idiomas, con filtros.
2. **Un estudiante con su perfil.** Sus intereses, sus fortalezas, el trabajo que sueña y su propósito, junto con las opciones que encajan con él. Cada coincidencia viene explicada.
3. **Arrastrar y soltar.** Armar filtros, mover estudiantes por etapas y llevar una universidad a la lista corta de un estudiante.
4. **Fechas y fuentes.** Becas con su ventana de postulación, su estado y el enlace oficial de donde sale cada dato.

La demo cumple si:

- [ ] Abre en menos de 2 segundos en local.
- [ ] No muestra errores en la consola del navegador.
- [ ] Funciona sin internet después de `npm run build` y `npm run preview`.
- [ ] Se ve bien a 1920×1080 (pantalla compartida) y a 1440×900 (laptop).
- [ ] Un botón **«Restablecer demo»** devuelve todo al estado inicial.

---

## 3. Restricciones (no negociables)

1. **Estudiantes 100 % ficticios.** Ningún nombre real, DNI (documento de identidad peruano), colegio real asociado a un alumno, correo ni teléfono. Cada ficha muestra una etiqueta visible: «Perfil ficticio».
2. **Datos institucionales reales, con fuente.** Cada dato de una universidad, beca o examen lleva:
   - el enlace a la fuente oficial;
   - la fecha de consulta;
   - un estado: `verificado` o `por_verificar`.
3. **Nunca inventar** fechas, montos, puntajes, vacantes ni requisitos. Si no lo encuentras en una fuente oficial, el campo queda vacío y la interfaz muestra «Por verificar».
4. **Nunca decidir elegibilidad.** La app no dice «eres elegible», «vas a ingresar» ni «te van a dar la beca». Usa «encaja con su perfil», «a explorar» y «requisito publicado».
5. **Sin backend, sin inicio de sesión, sin APIs de pago.** Todo corre en el navegador. Los datos de demo se guardan en `localStorage` (el almacenamiento local del navegador).
6. **Sin scraping (extracción automática de páginas web) dentro de la app.** Los datos institucionales viven en archivos JSON curados dentro del proyecto.
7. **Accesibilidad.** Contraste mínimo AA (el estándar básico de legibilidad de las pautas WCAG). El arrastrar y soltar también funciona con teclado.
8. **Diseño original.** No copies la marca, el logo ni la interfaz de ninguna empresa o universidad. Los nombres de las universidades aparecen como texto, sin sus escudos ni logos.

---

## 4. Stack técnico recomendado

| Pieza | Elección | Para qué |
|---|---|---|
| Base | Vite + React + TypeScript | Arranque rápido y tipado de datos |
| Estilos | Tailwind CSS | Sistema visual consistente |
| Arrastrar y soltar | `@dnd-kit/core` + `@dnd-kit/sortable` | Accesible con teclado y mouse |
| Estado | Zustand con `persist` | Estado global guardado en `localStorage` |
| Gráficos | Recharts | Radar de intereses y barras de coincidencia |
| Íconos | `lucide-react` | Íconos limpios y consistentes |
| Fechas | `date-fns` con locale `es` | Formato «13 de nov. de 2026» |
| Tipografías | `@fontsource` (empaquetadas) | Funcionan sin internet |

Usa las versiones estables actuales y fíjalas en `package.json`. Puedes usar shadcn/ui si te ahorra tiempo, pero no es obligatorio.

---

## 5. Identidad visual: Cooper Compass

### Concepto

Una brújula: cada estudiante tiene su propio norte. La interfaz se siente **cálida, profesional y serena**, como una buena sesión de orientación. No como un panel bancario.

- **Nombre:** Cooper Compass
- **Línea de marca:** «Cada estudiante, su propio norte.»
- **Logo:** una rosa de los vientos minimalista en SVG, con la aguja apuntando al noreste. Diseño original, hecho en el código.

### Paleta (tokens)

| Token | Uso | Valor sugerido |
|---|---|---|
| `--navy` | Texto principal, barra lateral | `#16213E` |
| `--cream` | Fondo general | `#FAF6EF` |
| `--paper` | Tarjetas | `#FFFFFF` |
| `--gold` | Acento de marca, aguja, botones principales | `#D99A29` |
| `--teal` | Coincidencias, estados positivos | `#2A8C82` |
| `--coral` | Alertas y fechas urgentes | `#E0644B` |
| `--sky` | Etiqueta EE. UU. | `#3D5A98` |
| `--terracotta` | Etiqueta Perú | `#B5473A` |
| `--muted` | Texto secundario | `#6B6F7B` |

Valida el contraste de cada combinación texto/fondo. Ajusta los tonos si alguno no llega a AA.

### Tipografía y estilo

- **Títulos:** Fraunces (serif con carácter).
- **Interfaz y textos:** Inter.
- Tarjetas con bordes redondeados de 16 px, sombras suaves y mucho espacio en blanco.
- Transiciones cortas de 150–200 ms al arrastrar, abrir paneles o filtrar.
- Evita los degradados morados y el look genérico de «plantilla de IA».

---

## 6. Pantallas

La navegación va en una barra lateral izquierda: Inicio · Estudiantes · Explorar · Becas y fechas · Comparar · Fuentes.

### A. Inicio («Hoy»)

- **Saludo** con la fecha de hoy.
- **Cuatro indicadores:** estudiantes activos · becas abiertas ahora · fechas límite en los próximos 14 días · opciones guardadas en listas cortas.
- **Línea de tiempo** de fechas límite (becas y admisiones) con semáforo de urgencia:
  - coral: menos de 14 días;
  - dorado: de 14 a 45 días;
  - teal: más de 45 días.
- **Tablero de estudiantes por etapa.** Es un tablero kanban (columnas por etapa, con tarjetas que se arrastran de una columna a otra):
  Descubrimiento → Perfil → Exploración → Lista corta → Postulación → Resultado.
- **Tarjeta de contexto** con el dato de Open Doors de la sección 1 y su fuente.

### B. Estudiantes

**Lista:** tarjetas con alias, etapa, países objetivo, sus tres letras de intereses principales y el número de opciones guardadas.

**Formulario «Nuevo estudiante»**, en pasos cortos:

1. **Datos básicos:** alias (por ejemplo «Valeria R.»), etapa, región, países objetivo, rango de presupuesto anual.
2. **Idiomas:** nivel de inglés en la escala MCER (Marco Común Europeo de Referencia, de A1 a C2), otros idiomas y certificaciones que ya tiene.
3. **Intereses:** puntaje de 0 a 10 en las seis dimensiones RIASEC. RIASEC es el modelo de intereses vocacionales de John Holland: Realista, Investigador, Artístico, Social, Emprendedor y Convencional.
4. **Fortalezas y competencias:** etiquetas seleccionables, por ejemplo «análisis», «comunicación», «liderazgo», «creatividad», «trabajo con personas».
5. **Trabajo soñado:** texto libre más etiquetas de sector.
6. **Propósito:** cuatro cuadrantes al estilo ikigai: lo que ama · en lo que es bueno · lo que el mundo necesita · por lo que le pagarían.

**Ficha del estudiante:**

- Encabezado con alias, etapa y la etiqueta «Perfil ficticio».
- Radar RIASEC y los cuatro cuadrantes de propósito.
- **«Opciones que encajan»:** carreras, universidades y becas ordenadas por coincidencia. Cada una explica sus razones (ver sección 7).
- **«Lo que más le importa»:** una lista que se reordena arrastrando (afinidad, costo, idioma, ubicación, duración). El orden cambia los pesos del cálculo de coincidencia.
- **Lista corta:** se reordena arrastrando y cada opción tiene su estado (explorando / preparando / postulado / resultado).
- **Checklist por opción:** requisitos publicados, documentos, exámenes e idioma. Lo que no está verificado aparece en gris con la etiqueta «Por verificar».
- **Notas** de la asesora.

### C. Explorar (catálogo unificado)

Pestañas: **Universidades · Carreras y programas · Modalidades de ingreso · Becas · Idiomas y exámenes**.

**Constructor de filtros con arrastrar y soltar:**

- A la izquierda hay una paleta de filtros: País, Ciudad, Tipo de gestión (pública o privada), Área, Carrera, Nivel (pregrado o posgrado), Modalidad de ingreso, Idioma requerido, Certificación aceptada, Costo, Ayuda financiera, Beca disponible, Fecha límite.
- Se arrastran a la zona «Mis filtros». Cada filtro se configura con un clic.
- El orden de los filtros define el orden de los resultados.
- Para quitar un filtro, se arrastra fuera de la zona.
- Las combinaciones se guardan como **vistas**, por ejemplo «Ingeniería en EE. UU. con ayuda financiera».

**Resultados:**

- En tarjetas o en tabla; un botón alterna entre las dos.
- Cada tarjeta muestra su país, la fecha de consulta y su estado de verificación.
- **Arrastrar una tarjeta sobre el avatar de un estudiante** (columna derecha) la agrega a su lista corta.

### D. Becas y fechas

- Calendario mensual y vista de lista.
- Cada beca muestra:
  - entidad que la ofrece;
  - nivel (pregrado o posgrado);
  - país de estudio;
  - cobertura publicada;
  - ventana de postulación;
  - estado: abierta, próxima, cerrada, suspendida o por confirmar;
  - enlace oficial.

### E. Comparar

- Hasta tres opciones lado a lado: requisitos, idioma, fechas, costo publicado, ayudas y coincidencia con un estudiante elegido.

### F. Fuentes

- Tabla con cada fuente: entidad, enlace, fecha de consulta y estado.
- Una fuente consultada hace más de 90 días se marca «Revisar».
- Este panel es parte del mensaje: el sistema muestra de dónde sale cada dato.

**Pie de página fijo:** «Información orientativa. Verifica siempre en la fuente oficial antes de asesorar.»

---

## 7. Cálculo de coincidencia (transparente)

El cálculo da un puntaje de **0 a 100** a cada opción para cada estudiante. Es una suma ponderada de cinco factores:

| Factor | Cómo se calcula |
|---|---|
| Afinidad vocacional | Cruza los puntajes RIASEC del estudiante con los códigos RIASEC de la carrera |
| Interés declarado | Coincidencia entre las áreas y el trabajo soñado del estudiante y el área del programa |
| Idioma | Nivel MCER del estudiante comparado con el requisito publicado. Sin dato publicado: neutro, con la nota «por verificar» |
| Costo | Presupuesto comparado con el costo publicado. Si hay beca o ayuda que aplique, suma |
| Ubicación y nivel | País y nivel (pregrado o posgrado) coinciden con lo que busca el estudiante |

**Pesos:** salen del orden de la lista «Lo que más le importa» de la ficha. El primer factor pesa más y el último, menos. Usa pesos lineales, por ejemplo 30 · 25 · 20 · 15 · 10.

**Explicación obligatoria.** Cada resultado muestra:

- **«Por qué aparece»:** de 2 a 4 razones, por ejemplo «Intereses Investigador y Social: encaja con Psicología».
- **«Qué falta revisar»:** de 1 a 3 puntos, por ejemplo «Requisito de inglés publicado: TOEFL iBT (Test of English as a Foreign Language, versión por internet); puntaje por verificar».
- Esta etiqueta: «Coincidencia orientativa. No determina elegibilidad.»

Mantén la lógica en un solo archivo (`src/lib/matching.ts`), con comentarios, para que en la sesión 3 se pueda ajustar con la clienta.

---

## 8. Modelo de datos (TypeScript)

Todo dato institucional va envuelto en `Fact<T>`. Así ningún valor aparece sin fuente.

```ts
type VerificationStatus = 'verificado' | 'por_verificar';

interface Source {
  id: string;
  publisher: string;          // p. ej. "Pronabec", "MIT Admissions"
  title: string;
  url: string;
  checked_at: string;         // ISO 8601, fecha de consulta
  status: VerificationStatus;
}

interface Fact<T> {
  value: T | null;            // null = no encontrado → la interfaz muestra "Por verificar"
  source_id?: string;
  note?: string;              // aclaración breve, p. ej. "según nota de prensa; confirmar en sitio oficial"
  status: VerificationStatus;
}

type Country = 'PE' | 'US';
type Level = 'pregrado' | 'posgrado';

interface Institution {
  id: string;
  name: string;
  short_name: string;
  country: Country;
  city: string;
  region: string;                         // departamento (PE) o estado (US)
  management: 'publica' | 'privada';
  website: string;
  sunedu_licensed?: Fact<boolean>;        // solo Perú: licenciamiento de SUNEDU (Superintendencia Nacional de Educación Superior Universitaria)
  tuition: Fact<{ min?: number; max?: number; currency: 'PEN' | 'USD'; period: 'ciclo' | 'año' | 'mes' }>;
  intl_aid?: Fact<'need_blind' | 'need_aware' | 'merito' | 'limitada'>;
  // need_blind = la universidad decide la admisión sin mirar la capacidad de pago del postulante
  tags: string[];
}

interface Program {
  id: string;
  institution_id: string;
  name: string;
  area: string;                           // p. ej. "Ingeniería", "Salud", "Negocios"
  level: Level;
  duration: Fact<string>;
  language_of_instruction: 'es' | 'en';
  riasec: string;                         // dos o tres letras, p. ej. "IR"
  career_paths: string[];
  source_id: string;
}

interface AdmissionMode {
  id: string;
  institution_id: string;
  name: string;                           // nombre propio de cada universidad
  for_whom: string;
  key_requirements: Fact<string[]>;
  next_dates: Fact<{ label: string; date: string }[]>;
}

interface Scholarship {
  id: string;
  name: string;
  provider: string;
  study_country: Country | 'varios';
  levels: Level[];
  coverage: Fact<string>;
  requirements: Fact<string[]>;
  language_requirement: Fact<string>;
  window: { opens: Fact<string>; closes: Fact<string> };
  status: 'abierta' | 'proxima' | 'cerrada' | 'suspendida' | 'por_confirmar';
  source_id: string;
}

interface Credential {                    // exámenes y certificaciones de idioma
  id: string;
  name: string;
  kind: 'idioma' | 'admision';
  language?: string;
  provider: string;
  format: Fact<string>;
  validity: Fact<string>;
  source_id: string;
}

interface Student {
  id: string;
  alias: string;                          // siempre ficticio
  stage: 'escolar_4to' | 'escolar_5to' | 'egresado_escolar' | 'universitario' | 'egresado_universitario';
  region: string;
  target_countries: Country[];
  budget_band: 'bajo' | 'medio' | 'alto' | 'requiere_beca';
  english_cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  other_languages: { language: string; cefr: string }[];
  credentials_held: string[];
  riasec: { R: number; I: number; A: number; S: number; E: number; C: number };
  strengths: string[];
  dream_work: { text: string; sectors: string[] };
  purpose: { ama: string; bueno: string; mundo: string; pagarian: string };
  priorities: ('afinidad' | 'costo' | 'idioma' | 'ubicacion' | 'nivel')[];
  shortlist: { target: 'program' | 'institution' | 'scholarship'; id: string; status: string }[];
  pipeline: 'descubrimiento' | 'perfil' | 'exploracion' | 'lista_corta' | 'postulacion' | 'resultado';
  notes: string;
  is_fictional: true;
}
```

Datos en `src/data/*.json`: `sources`, `institutions`, `programs`, `admission_modes`, `scholarships`, `credentials` y `students_demo`.

---

## 9. Datos semilla para la demo de hoy

### Cómo investigar

1. Usa solo **fuentes oficiales**: el sitio de la universidad, de la entidad que da la beca o del organismo que toma el examen. Una nota de prensa sirve como pista, pero no como fuente final.
2. Registra cada dato con su `Source` y su fecha de consulta.
3. Si no lo encuentras en 5 minutos, márcalo `por_verificar` y sigue. **La demo no puede esperar por un dato.**
4. Si no tienes acceso a internet, crea la estructura con todos los datos en `por_verificar` y avísale a Alejandro.

### Universidades: selección inicial

Esta lista es una **mezcla de referencia**: universidades muy selectivas, selectivas y de acceso más amplio. **No es un ranking de demanda.** En la sesión 3, la clienta dirá cuáles piden más sus estudiantes.

**Perú (8)**

| Universidad | Sigla |
|---|---|
| Pontificia Universidad Católica del Perú | PUCP |
| Universidad de Lima | ULima |
| Universidad del Pacífico | UP |
| Universidad Peruana de Ciencias Aplicadas | UPC |
| Universidad Nacional Mayor de San Marcos | UNMSM |
| Universidad Nacional de Ingeniería | UNI |
| Universidad Peruana Cayetano Heredia | UPCH |
| Universidad de Ingeniería y Tecnología | UTEC |

Para cada una registra: licenciamiento de SUNEDU, sus modalidades de ingreso con el nombre que usa la propia universidad (por ejemplo examen de admisión, admisión para primeros puestos o tercio superior, centro preuniversitario, Bachillerato Internacional), y de 3 a 4 carreras.

**Estados Unidos (8)**

| Universidad | Por qué está en la lista |
|---|---|
| Massachusetts Institute of Technology (MIT) | Ejemplo de admisión need-blind para internacionales (verificar) |
| Harvard University | Ejemplo de ayuda financiera para internacionales (verificar) |
| Purdue University | Ingeniería, muchos estudiantes internacionales |
| Arizona State University | Acceso más amplio, gran oferta de carreras |
| University of Florida | Universidad pública de Florida |
| Florida International University | Comunidad latina en Miami |
| University of Miami | Universidad privada en Miami |
| Boston University | Universidad privada urbana, amplia oferta |

Para cada una registra: costo publicado para internacionales, política de ayuda financiera para internacionales, si exige o no SAT/ACT (exámenes estandarizados de admisión a pregrado en EE. UU.; muchas universidades los volvieron opcionales y las políticas cambian), los requisitos de inglés que acepta, sus plazos de postulación (Early Action, Early Decision, Regular Decision) y de 3 a 4 programas.

**Carreras sugeridas** (solo si existen en la universidad): Ingeniería Industrial · Ciencias de la Computación / Ingeniería de Sistemas · Administración / Negocios · Economía · Medicina o Ciencias de la Salud · Psicología · Derecho · Arquitectura · Comunicaciones · Ciencia de Datos.

### Becas (7)

| Beca | Para qué sirve | Nota para la verificación |
|---|---|---|
| Beca Generación del Bicentenario (Pronabec, Programa Nacional de Becas y Crédito Educativo del Perú) | Posgrado en el extranjero | Gestión publicó el 29 de septiembre de 2026 una convocatoria extraordinaria: postulación del 30 de octubre al 13 de noviembre de 2026, 20 becas (17 de maestría y 3 de doctorado), resultados el 15 de diciembre de 2026. **Confirmar en el sitio oficial de Pronabec en gob.pe antes de mostrarlo como verificado.** Si se confirma, estará *abierta* durante la demo y es el mejor ejemplo de fecha urgente. |
| Beca 18 (Pronabec) | Pregrado en Perú | Revisar la convocatoria vigente o la próxima y sus requisitos publicados |
| Fulbright (Comisión Fulbright Perú) | Maestría en EE. UU. | Confirmar la convocatoria vigente y sus fechas |
| Hubert H. Humphrey Fellowship | Programa para profesionales con experiencia, en EE. UU. | Confirmar que Perú participa y las fechas |
| Programa de Becas Académicas de la OEA (Organización de los Estados Americanos) | Posgrado en las Américas | Confirmar el ciclo vigente |
| EducationUSA Opportunity Funds | Apoyo con los costos de postulación para estudiantes de alto rendimiento y bajos recursos | Confirmar que opera en Perú |
| Ayuda financiera institucional (MIT, Harvard) | Pregrado en EE. UU. | Registrarla como política de la universidad, no como beca con convocatoria |

### Idiomas y exámenes

**Certificaciones de inglés:**

- TOEFL iBT (de ETS, Educational Testing Service);
- IELTS Academic;
- Duolingo English Test;
- Cambridge English C1 Advanced y C2 Proficiency.

**Otros idiomas:**

- DELF y DALF (francés);
- Goethe-Zertifikat y TestDaF (alemán);
- CELI y CILS (italiano);
- Celpe-Bras (portugués de Brasil);
- JLPT (japonés);
- HSK (chino).

**Exámenes de admisión en EE. UU.:**

- SAT y ACT (pregrado);
- GRE (Graduate Record Examinations) y GMAT (Graduate Management Admission Test), para posgrado;
- Common App, la plataforma común de postulación a pregrado;
- CSS Profile, el formulario que piden muchas universidades privadas para calcular la ayuda financiera.

Para cada examen registra: quién lo administra, el formato, la vigencia publicada y el enlace oficial. **No pongas puntajes mínimos genéricos.** El puntaje mínimo lo publica cada universidad y va en su ficha.

### Estudiantes ficticios (6)

| Alias | Etapa | Perfil en una línea | Para qué sirve en la demo |
|---|---|---|---|
| Valeria R. | 5.º de secundaria, Lima | Investigador-Social, quiere salud pública, inglés B2, presupuesto medio | Perú y EE. UU. en paralelo |
| Diego M. | Egresado escolar, Arequipa | Realista-Investigador, robótica y mecatrónica, inglés B1, requiere beca | Beca 18 y universidades de Perú |
| Camila T. | Último ciclo de Economía | Emprendedora-Convencional, quiere maestría en políticas públicas, inglés C1 | Fulbright y Bicentenario: fechas urgentes |
| Sebastián L. | 4.º de secundaria, Trujillo | Artístico-Social, diseño y arquitectura, inglés B2 | Etapa de exploración temprana |
| Lucía F. | Egresada de Psicología | Social-Investigadora, psicología educativa, inglés B2 y francés A2 | Otros idiomas y posgrado |
| Mateo Q. | 5.º de secundaria, Lima | Investigador-Convencional, ciencia de datos, inglés C1, necesita ayuda financiera | MIT, Purdue y Arizona State, ayuda need-blind |

Reparte a los seis entre las columnas del tablero de etapas para que el tablero se vea vivo.

---

## 10. Arrastrar y soltar: dónde y cómo

| Lugar | Qué se arrastra | Resultado |
|---|---|---|
| Inicio | Tarjeta de estudiante entre columnas | Cambia su etapa |
| Explorar | Filtro desde la paleta a «Mis filtros» | Aplica el filtro |
| Explorar | Filtro dentro de «Mis filtros» | Cambia la prioridad del orden |
| Explorar | Filtro fuera de la zona | Lo quita |
| Explorar | Tarjeta de resultado sobre el avatar de un estudiante | La agrega a su lista corta, con un aviso breve de confirmación |
| Ficha | Factores de «Lo que más le importa» | Recalcula pesos y coincidencias en vivo |
| Ficha | Opciones de la lista corta | Cambia su prioridad |

Requisitos:

- funciona con mouse, pantalla táctil y teclado;
- muestra una sombra o vista previa mientras se arrastra;
- resalta la zona donde se puede soltar.

---

## 11. Tono de la interfaz

- Español de Perú y tuteo cálido: «Agrega un estudiante», «Arrastra aquí tus filtros».
- Los nombres oficiales quedan en su idioma original: Early Decision, Common App, need-blind. Explícalos con un tooltip (el texto que aparece al pasar el mouse).
- Los estados vacíos invitan a actuar: «Todavía no hay opciones en su lista corta. Arrastra una desde Explorar.»
- Las fechas van en formato peruano: «13 de nov. de 2026».
- Los montos indican moneda y periodo, con este formato: «USD XX XXX por año», «S/ X XXX por ciclo». Los montos reales salen siempre de la fuente.

---

## 12. Plan de trabajo por fases (demo hoy a las 18:00)

| Fase | Tiempo guía | Entregable |
|---|---|---|
| 0. Base | 15 min | Proyecto creado, tokens de diseño, barra lateral, rutas y tipos de la sección 8 |
| 1. Datos | 60–90 min | Archivos JSON con fuentes. Orden: becas → universidades de Perú → universidades de EE. UU. → idiomas y exámenes → estudiantes ficticios |
| 2. Núcleo | 60 min | Inicio con tablero de etapas, Explorar con constructor de filtros, ficha del estudiante con coincidencias |
| 3. Complementos | 30–45 min | Becas y fechas, Comparar, Fuentes, botón «Restablecer demo» |
| 4. Pulido y control de calidad | 20 min | Lista de la sección 14, `npm run build` y prueba sin internet |

Al terminar cada fase, muestra a Alejandro un resumen corto: qué hiciste, qué quedó «por verificar» y qué sigue.

**Si falta tiempo**, recorta en este orden: Comparar → calendario mensual (deja solo la lista) → vistas guardadas. **Nunca recortes** el tablero de etapas, la ficha con coincidencias explicadas ni las fuentes.

---

## 13. Recorrido sugerido de la demo (3 minutos)

1. **Inicio:** indicadores, fechas urgentes y el tablero de estudiantes. Mover a «Camila T.» de Exploración a Lista corta.
2. **Ficha de Mateo Q.:** radar de intereses, propósito, opciones que encajan con sus razones. Reordenar «Lo que más le importa» y ver cómo cambian las coincidencias.
3. **Explorar:** arrastrar los filtros País = EE. UU. y Área = Ingeniería; luego soltar una universidad sobre el avatar de Diego M.
4. **Becas y fechas:** una beca abierta con su fecha límite y su enlace oficial.
5. **Fuentes:** de dónde sale cada dato y cuándo se consultó.

---

## 14. Lista de control antes de entregar

- [ ] Ningún dato institucional aparece sin fuente o sin la etiqueta «Por verificar».
- [ ] Ninguna pantalla dice «elegible», «garantizado» ni nada equivalente.
- [ ] Los seis estudiantes llevan la etiqueta «Perfil ficticio».
- [ ] El arrastrar y soltar funciona en los siete casos de la sección 10, también con teclado.
- [ ] «Restablecer demo» devuelve todo al estado inicial.
- [ ] Sin errores ni advertencias en la consola.
- [ ] Se ve bien a 1920×1080 y a 1440×900.
- [ ] `npm run build` termina sin errores y la vista previa funciona sin internet.
- [ ] Hay un `README.md` con: cómo correrlo, cómo editar los JSON y cuántos datos quedaron verificados o por verificar.

---

## 15. Hacia la sesión 3 (no construir hoy)

Ideas para conversar con la clienta. No las implementes ahora:

- importar y exportar datos desde Google Sheets;
- alertas de fechas límite por correo;
- un informe en PDF por estudiante para conversar con la familia;
- un proyecto compartido en Claude con el contexto del negocio;
- dos usuarias (la clienta y su colega) con permisos distintos;
- trabajar con datos reales: consentimiento de las familias, protección de datos personales (Ley N.º 29733 en Perú) y usar solo los datos mínimos necesarios;
- actualización periódica de fuentes, siempre con revisión humana antes de publicar.

---

## 16. Lo que no debes hacer

- No uses datos reales de estudiantes, ni siquiera «de prueba».
- No inventes cifras para que la demo se vea más completa. Un «Por verificar» bien diseñado también impresiona: muestra rigor.
- No pongas logos ni escudos de universidades.
- No agregues inicio de sesión, base de datos externa ni servicios de pago.
- No prometas en la interfaz funciones que no existen. Si muestras algo futuro, márcalo «Próximamente».

---

## 17. Primer mensaje para Claude Code

Copia y pega esto al abrir Claude Code en la carpeta del proyecto:

```text
Lee HANDOFF.md completo antes de escribir código.

Luego, en no más de 12 líneas, devuélveme:
1. Tu plan por fases, con el tiempo que estimas para cada una.
2. El stack que vas a usar y sus versiones.
3. Cualquier duda que te impida avanzar.

Cuando lo apruebe, ejecuta fase por fase. Al cerrar cada fase, muéstrame qué hiciste, qué quedó "por verificar" y qué sigue.

La demo es hoy a las 18:00 (hora de Lima). Si algo se complica, prioriza que funcione y se vea bien sobre que esté completo, siguiendo la sección 12.
```
