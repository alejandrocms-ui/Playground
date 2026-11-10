/**
 * CÁLCULO DE COINCIDENCIA · Cooper and Case
 * ----------------------------------------
 * Puntaje de 0 a 100 para cada opción (carrera, universidad o beca) frente a un estudiante.
 * Es una suma ponderada de cinco factores, cada uno entre 0 y 1:
 *
 *   afinidad   → RIASEC del estudiante vs. código RIASEC de la carrera
 *   interes    → sectores y trabajo soñado vs. área y salidas de la carrera
 *   idioma     → nivel MCER del estudiante vs. requisito publicado
 *   costo      → presupuesto vs. costo publicado y ayudas que podrían aplicar
 *   ubicacion  → país y nivel (pregrado / posgrado) que busca el estudiante
 *
 * PESOS: salen del orden de «Lo que más le importa» en la ficha: 30 · 25 · 20 · 15 · 10.
 *
 * REGLAS DE TONO (no negociables):
 *  - Nunca decidimos elegibilidad. Hablamos de «encaja con su perfil», «a explorar», «requisito publicado».
 *  - Si un dato no está publicado o no está verificado, el factor queda NEUTRO (0,5)
 *    y aparece en «Qué falta revisar».
 *
 * Todo está en este archivo para ajustarlo con la clienta en la sesión 3.
 */
import type { Cefr, Country, Institution, Priority, Program, Scholarship, Student } from '../types';
import { institutionById, institutions, programs, programsByInstitution, scholarships } from './data';

export const WEIGHTS = [30, 25, 20, 15, 10];

export const PRIORITY_LABEL: Record<Priority, string> = {
  afinidad: 'Afinidad vocacional',
  interes: 'Interés declarado',
  idioma: 'Idioma',
  costo: 'Costo y ayudas',
  ubicacion: 'Ubicación y nivel',
};

export const RIASEC_LABEL: Record<string, string> = {
  R: 'Realista',
  I: 'Investigador',
  A: 'Artístico',
  S: 'Social',
  E: 'Emprendedor',
  C: 'Convencional',
};

export interface FactorResult {
  score: number; // 0..1
  reason?: string; // «Por qué aparece»
  check?: string; // «Qué falta revisar»
}

export interface MatchResult {
  kind: 'program' | 'institution' | 'scholarship';
  id: string;
  score: number; // 0..100
  factors: Record<Priority, FactorResult>;
  reasons: string[]; // 2–4
  checks: string[]; // 1–3
}

const CEFR_ORDER: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const cefrIndex = (c: Cefr) => CEFR_ORDER.indexOf(c);

/** Tres letras principales del estudiante, p. ej. «ISE». */
export function topRiasec(r: Student['riasec'], n = 3): string {
  return (Object.entries(r) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
    .join('');
}

/** Nivel que busca según su etapa. */
export function targetLevel(s: Student) {
  return s.stage === 'universitario' || s.stage === 'egresado_universitario' ? 'posgrado' : 'pregrado';
}

// ---------- Factores para carreras ----------

function afinidad(s: Student, p: Program): FactorResult {
  // La primera letra del código pesa más (1 · 0,7 · 0,5).
  const w = [1, 0.7, 0.5];
  const letters = p.riasec.split('').slice(0, 3);
  let num = 0;
  let den = 0;
  letters.forEach((l, i) => {
    num += ((s.riasec as Record<string, number>)[l] ?? 0) / 10 * w[i];
    den += w[i];
  });
  const score = den ? num / den : 0.5;
  const strong = letters.filter((l) => ((s.riasec as Record<string, number>)[l] ?? 0) >= 7).map((l) => RIASEC_LABEL[l]);
  return {
    score,
    reason: strong.length ? `Intereses ${strong.join(' y ')}: encaja con ${p.name}` : undefined,
  };
}

function interes(s: Student, p: Program): FactorResult {
  const sectors = s.dream_work.sectors.map((x) => x.toLowerCase());
  const text = `${s.dream_work.text} ${s.purpose.pagarian} ${s.purpose.ama}`.toLowerCase();
  if (sectors.includes(p.area.toLowerCase()))
    return { score: 1, reason: `Su trabajo soñado está en ${p.area}` };
  const hit = p.career_paths.find((c) => text.includes(c.toLowerCase()) || c.split(' ').some((w) => w.length > 5 && text.includes(w.toLowerCase())));
  if (hit) return { score: 0.75, reason: `Salida profesional afín a lo que busca: ${hit}` };
  return { score: 0.15 };
}

function idiomaProgram(s: Student, p: Program, inst?: Institution): FactorResult {
  if (p.language_of_instruction === 'es') return { score: 1 };
  const req = inst?.english_requirement;
  const lvl = cefrIndex(s.english_cefr);
  const base = lvl >= 4 ? 1 : lvl === 3 ? 0.75 : lvl === 2 ? 0.4 : 0.15;
  if (!req || req.status !== 'verificado' || !req.value) {
    return {
      score: 0.5,
      check: `Requisito de inglés de ${inst?.short_name ?? 'la universidad'}: por verificar`,
    };
  }
  return {
    score: base,
    reason: lvl >= 3 ? `Inglés ${s.english_cefr} frente a un requisito publicado por ${inst!.short_name}` : undefined,
    check: lvl < 4 ? `Comparar su inglés ${s.english_cefr} con el requisito publicado por ${inst!.short_name}` : undefined,
  };
}

function costoProgram(s: Student, p: Program, inst?: Institution): FactorResult {
  if (!inst) return { score: 0.5 };
  const needsAid = s.budget_band === 'requiere_beca' || s.budget_band === 'bajo';
  // Ayuda institucional publicada y verificada.
  if (inst.intl_aid?.status === 'verificado' && inst.intl_aid.value === 'need_blind' && needsAid) {
    return { score: 0.85, reason: `${inst.short_name} publica admisión need-blind y ayuda según necesidad` };
  }
  // Ayuda institucional publicada, pero limitada (no garantizada).
  if (inst.intl_aid?.status === 'verificado' && inst.intl_aid.value === 'limitada' && needsAid) {
    return { score: 0.6, reason: `${inst.short_name} publica un fondo de apoyo según necesidad, con cupos limitados`, check: `Solicitar el apoyo de ${inst.short_name} después de recibir la oferta` };
  }
  // Beca 18: pregrado en Perú.
  if (inst.country === 'PE' && p.level === 'pregrado' && needsAid) {
    return { score: 0.8, reason: 'Beca 18 financia pregrado en Perú: revisar requisitos publicados', check: 'Beca 18: requisitos publicados de la modalidad' };
  }
  if (inst.tuition.status !== 'verificado' || !inst.tuition.value) {
    return { score: 0.5, check: `Costo publicado de ${inst.short_name}: por verificar` };
  }
  return { score: 0.6 };
}

function ubicacion(s: Student, country: string | undefined, levels: string[]): FactorResult {
  const lvl = targetLevel(s);
  const okCountry = country === undefined || country === 'varios' || s.target_countries.includes(country as Country);
  const okLevel = levels.includes(lvl);
  const score = (okCountry ? 0.6 : 0) + (okLevel ? 0.4 : 0);
  const place = country === 'PE' ? 'Perú' : country === 'US' ? 'EE. UU.' : country === 'UK' ? 'el Reino Unido' : 'varios países';
  return {
    score,
    reason: okCountry && okLevel ? `${lvl === 'pregrado' ? 'Pregrado' : 'Posgrado'} en ${place}, como busca` : undefined,
  };
}

// ---------- Factores para becas ----------

function scholarshipFactors(s: Student, b: Scholarship): Record<Priority, FactorResult> {
  const needsAid = s.budget_band !== 'alto';
  const lang = b.language_requirement;
  const country = b.study_country;
  const sectorMatch = s.dream_work.sectors.some((x) => /públic|educa|salud/i.test(x));
  return {
    afinidad: { score: 0.6 },
    interes: {
      score: b.levels.includes('posgrado') && sectorMatch ? 0.7 : 0.5,
      reason: b.levels.includes('posgrado') && sectorMatch ? 'Su propósito apunta a un posgrado de impacto público' : undefined,
    },
    idioma:
      lang.status === 'verificado' && lang.value
        ? {
            score: cefrIndex(s.english_cefr) >= 3 || country === 'PE' ? 0.85 : 0.4,
            reason: country === 'PE' ? 'Estudios en Perú: sin certificación de idioma publicada' : undefined,
            check: country !== 'PE' ? `Requisito de idioma publicado: ${lang.value}` : undefined,
          }
        : { score: 0.5, check: 'Requisito de idioma: por verificar' },
    costo: {
      score: needsAid ? 0.95 : 0.5,
      reason: needsAid && b.coverage.value ? `Cobertura publicada: ${b.coverage.value.split('.')[0]}` : needsAid ? 'Busca financiamiento y esta beca lo ofrece' : undefined,
      check: b.coverage.status !== 'verificado' ? 'Cobertura: por verificar' : undefined,
    },
    ubicacion: ubicacion(s, country, b.levels),
  };
}

// ---------- Combinación ----------

function combine(s: Student, kind: MatchResult['kind'], id: string, factors: Record<Priority, FactorResult>, extraChecks: string[] = [], leadChecks: string[] = []): MatchResult {
  let score = 0;
  s.priorities.forEach((p, i) => {
    score += (factors[p]?.score ?? 0.5) * (WEIGHTS[i] ?? 0);
  });
  // Razones en el orden de prioridad del estudiante.
  const reasons = s.priorities.map((p) => factors[p]?.reason).filter(Boolean) as string[];
  // Los avisos críticos (leadChecks) van siempre primero para que nunca queden fuera del límite de 3.
  const checks = [...leadChecks, ...s.priorities.map((p) => factors[p]?.check).filter(Boolean), ...extraChecks] as string[];
  if (reasons.length < 2) reasons.push('Opción a explorar con el estudiante');
  return {
    kind,
    id,
    score: Math.round(score),
    factors,
    reasons: reasons.slice(0, 4),
    checks: (checks.length ? checks : ['Revisar requisitos publicados en la fuente oficial']).slice(0, 3),
  };
}

export function matchProgram(s: Student, p: Program): MatchResult {
  const inst = institutionById.get(p.institution_id);
  const factors: Record<Priority, FactorResult> = {
    afinidad: afinidad(s, p),
    interes: interes(s, p),
    idioma: idiomaProgram(s, p, inst),
    costo: costoProgram(s, p, inst),
    ubicacion: ubicacion(s, inst?.country, [p.level]),
  };
  const extra: string[] = [];
  if (inst?.country === 'US' && p.level === 'pregrado' && inst.test_policy?.status === 'verificado')
    extra.push(`SAT/ACT: ${inst.test_policy.value}`);
  // Universidades que no aceptan el certificado de secundaria peruano: siempre se avisa.
  const lead: string[] = [];
  if (inst?.local_diploma?.value && p.level === 'pregrado')
    lead.push(`${inst.short_name} no acepta el certificado de secundaria peruano: requiere IB, A levels, AP u otra ruta aceptada`);
  if (inst?.country === 'UK' && /econom/i.test(p.name)) extra.push('Examen TMUA para Economía: confirmar si es obligatorio en 2027');
  if (inst?.country === 'UK' && /laws|derecho/i.test(p.name)) extra.push('Examen LNAT obligatorio para Derecho');
  return combine(s, 'program', p.id, factors, extra, lead);
}

export function matchScholarship(s: Student, b: Scholarship): MatchResult {
  return combine(s, 'scholarship', b.id, scholarshipFactors(s, b), b.window.closes.status !== 'verificado' ? ['Ventana de postulación: por confirmar'] : []);
}

/** Universidad: toma su carrera con mejor coincidencia. */
export function matchInstitution(s: Student, inst: Institution): MatchResult {
  const best = programsByInstitution(inst.id)
    .map((p) => matchProgram(s, p))
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return combine(s, 'institution', inst.id, { afinidad: { score: 0.5 }, interes: { score: 0.5 }, idioma: { score: 0.5 }, costo: { score: 0.5 }, ubicacion: ubicacion(s, inst.country, ['pregrado', 'posgrado']) });
  return { ...best, kind: 'institution', id: inst.id };
}

export function matchAny(s: Student, kind: MatchResult['kind'], id: string): MatchResult | null {
  if (kind === 'program') {
    const p = programs.find((x) => x.id === id);
    return p ? matchProgram(s, p) : null;
  }
  if (kind === 'institution') {
    const i = institutions.find((x) => x.id === id);
    return i ? matchInstitution(s, i) : null;
  }
  const b = scholarships.find((x) => x.id === id);
  return b ? matchScholarship(s, b) : null;
}

/** «Opciones que encajan»: carreras del nivel que busca + becas, ordenadas. */
export function topMatches(s: Student, nPrograms = 5, nScholarships = 3) {
  const lvl = targetLevel(s);
  const progs = programs
    // Solo países que el estudiante busca (filtro duro) y el nivel que corresponde a su etapa.
    .filter((p) => p.level === lvl && s.target_countries.includes(institutionById.get(p.institution_id)?.country ?? 'PE'))
    .map((p) => matchProgram(s, p))
    .sort((a, b) => b.score - a.score)
    .slice(0, nPrograms);
  const becas = scholarships
    .filter((b) => b.levels.includes(lvl) && b.status !== 'cerrada' && b.status !== 'suspendida' && (b.study_country === 'varios' || s.target_countries.includes(b.study_country)))
    .map((b) => matchScholarship(s, b))
    .sort((a, b) => b.score - a.score)
    .slice(0, nScholarships);
  return { programs: progs, scholarships: becas };
}
