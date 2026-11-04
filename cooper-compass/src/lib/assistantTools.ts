/**
 * Herramientas de Brújula IA (el asistente conversacional).
 * ---------------------------------------------------------
 * Claude no ve el código: solo el nombre, la descripción y el esquema de cada herramienta.
 * Las herramientas de LECTURA responden con datos del catálogo (siempre con estado y fuente).
 * Las herramientas que CAMBIAN datos no ejecutan nada: crean una PROPUESTA que la asesora
 * aplica o descarta con un clic. Navegar y aplicar filtros sí se ejecutan al momento
 * porque no modifican datos.
 */
import type { Claude } from './claudeTypes';
import { useStore, type FilterKey, type Page } from '../store';
import type { Fact, Pipeline, Priority, Student } from '../types';
import {
  admissionModes, allDates, credentials, institutionById, institutions, modesByInstitution, programById, programs,
  programsByInstitution, scholarshipById, scholarships, sourceById, targetLabel,
} from './data';
import { daysUntil, fmtDate, stageLabel } from './format';
import { PRIORITY_LABEL, matchAny, topMatches, topRiasec } from './matching';

export interface Proposal {
  id: string;
  title: string; // qué se propone, en una línea
  detail?: string;
  status: 'pendiente' | 'aplicada' | 'descartada';
  apply: () => string; // devuelve el texto del aviso
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (hay: string, needle?: unknown) => !needle || norm(hay).includes(norm(String(needle)));

function fact<T>(f?: Fact<T>) {
  if (!f || f.value == null) return { valor: null, estado: 'por_verificar', nota: f?.note };
  const s = f.source_id ? sourceById.get(f.source_id) : undefined;
  return { valor: f.value, estado: f.status, nota: f.note, fuente: s ? `${s.publisher} (${s.url})` : undefined, consultado: s?.checked_at ?? undefined };
}

const students = () => useStore.getState().students;
const findStudent = (id: unknown) => {
  const q = norm(String(id ?? ''));
  const s = students().find((x) => x.id === id || norm(x.alias).startsWith(q) || norm(x.alias).replace('.', '') === q.replace('.', ''));
  if (!s) throw new Error(`No encontré al estudiante «${id}». Usa listar_estudiantes para ver los ids.`);
  return s;
};

const PIPE: Pipeline[] = ['descubrimiento', 'perfil', 'exploracion', 'lista_corta', 'postulacion', 'resultado'];
const PIPE_LABEL: Record<Pipeline, string> = {
  descubrimiento: 'Descubrimiento', perfil: 'Perfil', exploracion: 'Exploración', lista_corta: 'Lista corta', postulacion: 'Postulación', resultado: 'Resultado',
};
const PAGES: Page[] = ['inicio', 'estudiantes', 'explorar', 'becas', 'comparar', 'fuentes'];
const FILTER_KEYS: FilterKey[] = ['pais', 'ciudad', 'gestion', 'area', 'carrera', 'nivel', 'modalidad', 'idioma', 'certificacion', 'costo', 'ayuda', 'beca', 'fecha'];

type Tool = Claude.sample.SampleTool;

export function buildTools(propose: (p: Omit<Proposal, 'id' | 'status'>) => void): Tool[] {
  return [
    {
      name: 'buscar_catalogo',
      description:
        'Busca en el catálogo de Cooper Compass. tipo: universidades | carreras | becas | modalidades | examenes. Devuelve hasta 15 resultados con id, nombre, país y estado de verificación. Úsala antes de hablar de cualquier universidad, carrera, beca o examen.',
      inputSchema: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['universidades', 'carreras', 'becas', 'modalidades', 'examenes'] },
          texto: { type: 'string', description: 'Palabra clave opcional (nombre, área, carrera, ciudad).' },
          pais: { type: 'string', enum: ['PE', 'US'] },
          nivel: { type: 'string', enum: ['pregrado', 'posgrado'] },
        },
        required: ['tipo'],
      },
      execute: (i) => {
        const tipo = String(i.tipo);
        const pais = i.pais ? String(i.pais) : undefined;
        const nivel = i.nivel ? String(i.nivel) : undefined;
        if (tipo === 'universidades')
          return institutions
            .filter((x) => (!pais || x.country === pais) && has(`${x.name} ${x.short_name} ${x.city} ${x.tags.join(' ')} ${programsByInstitution(x.id).map((p) => `${p.name} ${p.area}`).join(' ')}`, i.texto))
            .filter((x) => !nivel || programsByInstitution(x.id).some((p) => p.level === nivel))
            .slice(0, 15)
            .map((x) => ({ id: x.id, nombre: x.name, sigla: x.short_name, pais: x.country, ciudad: x.city, gestion: x.management, carreras: programsByInstitution(x.id).length }));
        if (tipo === 'carreras')
          return programs
            .filter((p) => (!pais || institutionById.get(p.institution_id)?.country === pais) && (!nivel || p.level === nivel))
            .filter((p) => has(`${p.name} ${p.area} ${p.career_paths.join(' ')} ${institutionById.get(p.institution_id)?.name} ${institutionById.get(p.institution_id)?.short_name}`, i.texto))
            .slice(0, 15)
            .map((p) => ({ id: p.id, nombre: p.name, universidad: institutionById.get(p.institution_id)?.short_name, pais: institutionById.get(p.institution_id)?.country, area: p.area, nivel: p.level, riasec: p.riasec }));
        if (tipo === 'becas')
          return scholarships
            .filter((s) => (!pais || s.study_country === pais || s.study_country === 'varios') && (!nivel || s.levels.includes(nivel as 'pregrado')))
            .filter((s) => has(`${s.name} ${s.provider}`, i.texto))
            .map((s) => ({ id: s.id, nombre: s.name, entidad: s.provider, estado_convocatoria: s.status, cierre: fact(s.window.closes) }));
        if (tipo === 'modalidades')
          return admissionModes
            .filter((m) => (!pais || institutionById.get(m.institution_id)?.country === pais) && has(`${m.name} ${m.for_whom} ${institutionById.get(m.institution_id)?.name} ${institutionById.get(m.institution_id)?.short_name}`, i.texto))
            .slice(0, 15)
            .map((m) => ({ id: m.id, nombre: m.name, universidad: institutionById.get(m.institution_id)?.short_name, para_quien: m.for_whom, estado: m.key_requirements.status }));
        return credentials
          .filter((c) => has(`${c.name} ${c.provider} ${c.language ?? ''}`, i.texto))
          .map((c) => ({ id: c.id, nombre: c.name, tipo: c.kind, idioma: c.language, administra: c.provider, formato: 'por_verificar', vigencia: 'por_verificar' }));
      },
    },
    {
      name: 'ver_detalle',
      description:
        'Devuelve la ficha completa de una universidad, carrera o beca por su id: cada dato con su valor, estado (verificado / por_verificar), nota y fuente oficial. Úsala para responder requisitos, fechas, idioma, costos o ayudas.',
      inputSchema: {
        type: 'object',
        properties: { tipo: { type: 'string', enum: ['universidad', 'carrera', 'beca'] }, id: { type: 'string' } },
        required: ['tipo', 'id'],
      },
      execute: (i) => {
        const id = String(i.id);
        if (i.tipo === 'beca') {
          const s = scholarshipById.get(id);
          if (!s) throw new Error('Beca no encontrada');
          return {
            nombre: s.name, entidad: s.provider, pais_estudio: s.study_country, niveles: s.levels, estado_convocatoria: s.status,
            tipo: s.kind === 'institucional' ? 'política de ayuda de una universidad' : 'convocatoria',
            cobertura: fact(s.coverage), requisitos: fact(s.requirements), idioma: fact(s.language_requirement),
            apertura: fact(s.window.opens), cierre: fact(s.window.closes), otras_fechas: fact(s.other_dates),
          };
        }
        const p = i.tipo === 'carrera' ? programById.get(id) : undefined;
        const inst = institutionById.get(p ? p.institution_id : id);
        if (!inst) throw new Error('No encontrado');
        return {
          universidad: inst.name, pais: inst.country, ciudad: inst.city, gestion: inst.management,
          ...(p ? { carrera: p.name, area: p.area, nivel: p.level, idioma_clases: p.language_of_instruction, riasec: p.riasec, duracion: fact(p.duration) } : {}),
          costo: fact(inst.tuition), ayuda_internacional: fact(inst.intl_aid), requisito_ingles: fact(inst.english_requirement),
          examenes_ingles_aceptados: fact(inst.english_tests), sat_act: fact(inst.test_policy), licencia_sunedu: inst.country === 'PE' ? fact(inst.sunedu_licensed) : undefined,
          modalidades: modesByInstitution(inst.id).map((m) => ({ nombre: m.name, para_quien: m.for_whom, requisitos: fact(m.key_requirements), fechas: fact(m.next_dates) })),
          carreras: programsByInstitution(inst.id).map((x) => ({ id: x.id, nombre: x.name })),
        };
      },
    },
    {
      name: 'listar_estudiantes',
      description: 'Lista los estudiantes (todos ficticios) con id, alias, etapa del tablero, países objetivo, presupuesto, inglés, código RIASEC y tamaño de su lista corta.',
      execute: () =>
        students().map((s) => ({
          id: s.id, alias: s.alias, etapa_escolar: stageLabel[s.stage], tablero: PIPE_LABEL[s.pipeline], paises: s.target_countries,
          presupuesto: s.budget_band, ingles: s.english_cefr, riasec: topRiasec(s.riasec), lista_corta: s.shortlist.length,
        })),
    },
    {
      name: 'ver_estudiante',
      description:
        'Perfil completo de un estudiante (por id o alias): intereses, fortalezas, propósito, prioridades, notas, su lista corta y las opciones que encajan con su puntaje (0-100), razones y lo que falta revisar.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'id (stu-...) o alias' } }, required: ['id'] },
      execute: (i) => {
        const s = findStudent(i.id);
        const tm = topMatches(s);
        const fmt = (m: ReturnType<typeof matchAny>) => m && ({ tipo: m.kind, id: m.id, nombre: targetLabel(m.kind, m.id).title, donde: targetLabel(m.kind, m.id).subtitle, puntaje: m.score, por_que: m.reasons, falta_revisar: m.checks });
        return {
          id: s.id, alias: s.alias, perfil_ficticio: true, etapa: stageLabel[s.stage], region: s.region, tablero: PIPE_LABEL[s.pipeline],
          paises: s.target_countries, presupuesto: s.budget_band, ingles: s.english_cefr, otros_idiomas: s.other_languages,
          riasec: s.riasec, fortalezas: s.strengths, trabajo_sonado: s.dream_work, proposito: s.purpose, prioridades: s.priorities, notas: s.notes,
          lista_corta: s.shortlist.map((x) => ({ ...fmt(matchAny(s, x.target, x.id)), estado: x.status })),
          opciones_que_encajan: [...tm.programs, ...tm.scholarships].map(fmt),
        };
      },
    },
    {
      name: 'proximas_fechas',
      description: 'Fechas publicadas (cierres de becas, exámenes, plazos de admisión) dentro de los próximos N días, con su estado de verificación.',
      inputSchema: { type: 'object', properties: { dias: { type: 'number' } } },
      execute: (i) => {
        const n = Number(i.dias ?? 45) || 45;
        return allDates()
          .filter((d) => daysUntil(d.date) >= 0 && daysUntil(d.date) <= n)
          .map((d) => ({ evento: d.label, fecha: fmtDate(d.date), dias: daysUntil(d.date), estado: d.status, nota: d.note }));
      },
    },
    {
      name: 'ir_a',
      description: 'Abre una pantalla del dashboard: inicio, estudiantes, explorar, becas, comparar o fuentes. Con estudiante_id abre la ficha de ese estudiante.',
      inputSchema: {
        type: 'object',
        properties: { pagina: { type: 'string', enum: PAGES }, estudiante_id: { type: 'string' } },
        required: ['pagina'],
      },
      execute: (i) => {
        const page = String(i.pagina) as Page;
        if (!PAGES.includes(page)) throw new Error('Página desconocida');
        const sid = i.estudiante_id ? findStudent(i.estudiante_id).id : null;
        useStore.getState().go(page, sid);
        return 'Pantalla abierta.';
      },
    },
    {
      name: 'aplicar_filtros',
      description:
        'Abre Explorar con estos filtros, en este orden. claves: pais (PE|US), ciudad, gestion (publica|privada), area (p. ej. Ingeniería, Salud, Tecnología, Negocios), carrera (texto), nivel (pregrado|posgrado), modalidad (escolar|egresado|early), idioma (es|en), certificacion (toefl|ielts|duolingo|cambridge), costo (publicado|pv), ayuda (si), beca (si), fecha (14|45|120).',
      inputSchema: {
        type: 'object',
        properties: { filtros: { type: 'array', items: { type: 'object', properties: { clave: { type: 'string' }, valor: { type: 'string' } }, required: ['clave', 'valor'] } } },
        required: ['filtros'],
      },
      execute: (i) => {
        const list = Array.isArray(i.filtros) ? i.filtros : [];
        const filters = list
          .map((f) => ({ key: String((f as Record<string, unknown>).clave) as FilterKey, value: String((f as Record<string, unknown>).valor ?? '') }))
          .filter((f) => FILTER_KEYS.includes(f.key));
        const st = useStore.getState();
        st.setFilters(filters);
        st.go('explorar');
        return `Filtros aplicados: ${filters.map((f) => `${f.key}=${f.value}`).join(', ') || 'ninguno'}.`;
      },
    },
    {
      name: 'proponer_lista_corta',
      description:
        'Propone agregar una carrera, universidad o beca a la lista corta de un estudiante. NO lo aplica: la asesora confirma con un clic. tipo: program | institution | scholarship.',
      inputSchema: {
        type: 'object',
        properties: { estudiante_id: { type: 'string' }, tipo: { type: 'string', enum: ['program', 'institution', 'scholarship'] }, id: { type: 'string' } },
        required: ['estudiante_id', 'tipo', 'id'],
      },
      execute: (i) => {
        const s = findStudent(i.estudiante_id);
        const tipo = String(i.tipo) as 'program' | 'institution' | 'scholarship';
        const id = String(i.id);
        const ok = tipo === 'program' ? programById.has(id) : tipo === 'institution' ? institutionById.has(id) : scholarshipById.has(id);
        if (!ok) throw new Error('Ese id no existe en el catálogo. Búscalo primero con buscar_catalogo.');
        const t = targetLabel(tipo, id);
        propose({
          title: `Agregar «${t.title}» a la lista corta de ${s.alias}`,
          detail: t.subtitle,
          apply: () => (useStore.getState().addToShortlist(s.id, { target: tipo, id }) ? `${t.title} se agregó a la lista corta de ${s.alias}` : `Ya estaba en la lista corta de ${s.alias}`),
        });
        return 'Propuesta creada. La asesora debe confirmarla en el panel.';
      },
    },
    {
      name: 'proponer_etapa',
      description: 'Propone mover a un estudiante a otra etapa del tablero (descubrimiento, perfil, exploracion, lista_corta, postulacion, resultado). La asesora confirma.',
      inputSchema: { type: 'object', properties: { estudiante_id: { type: 'string' }, etapa: { type: 'string', enum: PIPE } }, required: ['estudiante_id', 'etapa'] },
      execute: (i) => {
        const s = findStudent(i.estudiante_id);
        const etapa = String(i.etapa) as Pipeline;
        if (!PIPE.includes(etapa)) throw new Error('Etapa desconocida');
        propose({
          title: `Mover a ${s.alias} a «${PIPE_LABEL[etapa]}»`,
          detail: `Hoy está en ${PIPE_LABEL[s.pipeline]}`,
          apply: () => {
            useStore.getState().setPipeline(s.id, etapa);
            return `${s.alias} pasó a ${PIPE_LABEL[etapa]}`;
          },
        });
        return 'Propuesta creada. La asesora debe confirmarla.';
      },
    },
    {
      name: 'proponer_nota',
      description: 'Propone agregar una nota (acuerdos, próximos pasos, dudas) al final de las notas de un estudiante. La asesora confirma.',
      inputSchema: { type: 'object', properties: { estudiante_id: { type: 'string' }, texto: { type: 'string' } }, required: ['estudiante_id', 'texto'] },
      execute: (i) => {
        const s = findStudent(i.estudiante_id);
        const texto = String(i.texto ?? '').trim().slice(0, 800);
        if (!texto) throw new Error('La nota está vacía');
        propose({
          title: `Agregar nota a ${s.alias}`,
          detail: texto,
          apply: () => {
            const cur = useStore.getState().students.find((x) => x.id === s.id)?.notes ?? '';
            useStore.getState().setNotes(s.id, cur ? `${cur}\n\n${texto}` : texto);
            return `Nota agregada a ${s.alias}`;
          },
        });
        return 'Propuesta creada. La asesora debe confirmarla.';
      },
    },
    {
      name: 'proponer_prioridades',
      description: 'Propone un nuevo orden de «Lo que más le importa» para un estudiante: lista con las 5 claves afinidad, interes, idioma, costo, ubicacion, de más a menos importante.',
      inputSchema: {
        type: 'object',
        properties: { estudiante_id: { type: 'string' }, orden: { type: 'array', items: { type: 'string', enum: ['afinidad', 'interes', 'idioma', 'costo', 'ubicacion'] } } },
        required: ['estudiante_id', 'orden'],
      },
      execute: (i) => {
        const s = findStudent(i.estudiante_id);
        const all: Priority[] = ['afinidad', 'interes', 'idioma', 'costo', 'ubicacion'];
        const orden = (Array.isArray(i.orden) ? i.orden.map(String) : []).filter((x): x is Priority => all.includes(x as Priority));
        const full = [...new Set([...orden, ...s.priorities])] as Priority[];
        propose({
          title: `Reordenar prioridades de ${s.alias}`,
          detail: full.map((p, n) => `${n + 1}. ${PRIORITY_LABEL[p]}`).join(' · '),
          apply: () => {
            useStore.getState().setPriorities(s.id, full);
            return `Prioridades de ${s.alias} actualizadas`;
          },
        });
        return 'Propuesta creada. La asesora debe confirmarla.';
      },
    },
    {
      name: 'proponer_estudiante',
      description:
        'Propone crear un estudiante NUEVO y FICTICIO (solo alias, nunca nombre completo, DNI, correo ni teléfono). riasec: puntajes 0-10. La asesora confirma.',
      inputSchema: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'Nombre y una inicial, p. ej. «Andrea P.»' },
          etapa: { type: 'string', enum: ['escolar_4to', 'escolar_5to', 'egresado_escolar', 'universitario', 'egresado_universitario'] },
          region: { type: 'string' },
          paises: { type: 'array', items: { type: 'string', enum: ['PE', 'US'] } },
          presupuesto: { type: 'string', enum: ['bajo', 'medio', 'alto', 'requiere_beca'] },
          ingles: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
          riasec: { type: 'object', properties: { R: { type: 'number' }, I: { type: 'number' }, A: { type: 'number' }, S: { type: 'number' }, E: { type: 'number' }, C: { type: 'number' } } },
          fortalezas: { type: 'array', items: { type: 'string' } },
          trabajo_sonado: { type: 'string' },
          sectores: { type: 'array', items: { type: 'string' } },
        },
        required: ['alias'],
      },
      execute: (i) => {
        const alias = String(i.alias ?? '').trim().slice(0, 40);
        if (alias.length < 2) throw new Error('Falta el alias');
        const r = (i.riasec ?? {}) as Record<string, unknown>;
        const clamp = (v: unknown) => Math.max(0, Math.min(10, Math.round(Number(v ?? 5)) || 5));
        const paises = (Array.isArray(i.paises) ? i.paises.map(String) : ['PE']).filter((x) => x === 'PE' || x === 'US') as ('PE' | 'US')[];
        const st: Student = {
          id: `stu-${Date.now()}`,
          alias,
          stage: (['escolar_4to', 'escolar_5to', 'egresado_escolar', 'universitario', 'egresado_universitario'].includes(String(i.etapa)) ? String(i.etapa) : 'escolar_5to') as Student['stage'],
          region: String(i.region ?? 'Lima').slice(0, 40),
          target_countries: paises.length ? paises : ['PE'],
          budget_band: (['bajo', 'medio', 'alto', 'requiere_beca'].includes(String(i.presupuesto)) ? String(i.presupuesto) : 'medio') as Student['budget_band'],
          english_cefr: (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(String(i.ingles)) ? String(i.ingles) : 'B1') as Student['english_cefr'],
          other_languages: [],
          credentials_held: [],
          riasec: { R: clamp(r.R), I: clamp(r.I), A: clamp(r.A), S: clamp(r.S), E: clamp(r.E), C: clamp(r.C) },
          strengths: Array.isArray(i.fortalezas) ? i.fortalezas.map(String).slice(0, 6) : [],
          dream_work: { text: String(i.trabajo_sonado ?? '').slice(0, 300), sectors: Array.isArray(i.sectores) ? i.sectores.map(String).slice(0, 4) : [] },
          purpose: { ama: '', bueno: '', mundo: '', pagarian: '' },
          priorities: ['afinidad', 'interes', 'costo', 'idioma', 'ubicacion'],
          shortlist: [],
          pipeline: 'descubrimiento',
          notes: 'Creado con Brújula IA.',
          is_fictional: true,
        };
        propose({
          title: `Crear estudiante ficticio «${alias}»`,
          detail: `${stageLabel[st.stage]} · ${st.region} · ${st.target_countries.join(', ')} · inglés ${st.english_cefr} · RIASEC ${topRiasec(st.riasec)}`,
          apply: () => {
            useStore.getState().addStudent(st);
            return `${alias} se agregó a Descubrimiento`;
          },
        });
        return 'Propuesta creada. La asesora debe confirmarla.';
      },
    },
  ];
}

/** Instrucciones permanentes (primer turno de la conversación). */
export function rules(): string {
  const st = useStore.getState();
  const current = st.page === 'estudiantes' && st.studentId ? `la ficha de ${st.students.find((s) => s.id === st.studentId)?.alias} (id ${st.studentId})` : `la pantalla «${st.page}»`;
  return `Eres Brújula IA, el asistente de Cooper Compass, un dashboard de orientación vocacional en Perú (universidades de Perú y EE. UU., carreras, modalidades de ingreso, becas e idiomas). Ayudas a la asesora a buscar información, analizar perfiles y administrar los datos.

Hoy es ${fmtDate(new Date().toISOString().slice(0, 10))}. La asesora está viendo ${current}.

REGLAS (no negociables):
1. Usa SOLO datos que devuelvan tus herramientas. Consulta antes de responder sobre cualquier universidad, beca, carrera, examen o estudiante. Nunca inventes fechas, montos, puntajes, vacantes ni requisitos.
2. Si un dato viene como null o «por_verificar», dilo así: «Por verificar». Cuando des un dato verificado, menciona la entidad que lo publica.
3. Nunca decidas elegibilidad. No digas «es elegible», «va a ingresar» ni «le darán la beca». Usa «encaja con su perfil», «a explorar», «requisito publicado».
4. Los estudiantes son ficticios. Nunca pidas ni registres nombres completos, DNI, correos ni teléfonos.
5. Para CAMBIAR datos usa las herramientas proponer_*: crean una propuesta que la asesora confirma. Dilo con naturalidad («Te dejé la propuesta para que la confirmes»). Navegar (ir_a) y filtrar (aplicar_filtros) sí puedes hacerlo directo cuando ayude.
6. Responde en español de Perú, con tuteo cálido, breve y concreto: máximo 6 líneas o 5 viñetas, salvo que te pidan un texto más largo (por ejemplo un resumen para la familia). Usa **negritas** para lo clave y viñetas con «- ». No uses tablas ni encabezados.`;
}
