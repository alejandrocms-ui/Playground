import type { AdmissionMode, Credential, Institution, Program, Scholarship, Source, Student } from '../types';
import sourcesJson from '../data/sources.json';
import institutionsJson from '../data/institutions.json';
import programsJson from '../data/programs.json';
import modesJson from '../data/admission_modes.json';
import scholarshipsJson from '../data/scholarships.json';
import credentialsJson from '../data/credentials.json';
import studentsJson from '../data/students_demo.json';

export const sources = sourcesJson as Source[];
export const institutions = institutionsJson as Institution[];
export const programs = programsJson as Program[];
export const admissionModes = modesJson as AdmissionMode[];
export const scholarships = scholarshipsJson as Scholarship[];
export const credentials = credentialsJson as Credential[];
export const studentsSeed = studentsJson as Student[];

const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
export const sourceById = byId(sources);
export const institutionById = byId(institutions);
export const programById = byId(programs);
export const scholarshipById = byId(scholarships);
export const credentialById = byId(credentials);

export const modesByInstitution = (id: string) => admissionModes.filter((m) => m.institution_id === id);
export const programsByInstitution = (id: string) => programs.filter((p) => p.institution_id === id);

export const areas = Array.from(new Set(programs.map((p) => p.area))).sort();
export const cities = Array.from(new Set(institutions.map((i) => i.city))).sort();

/** Fecha de referencia del contexto (Open Doors). */
export const openDoors = {
  total: 5505,
  year: '2023/24',
  split: [
    { label: 'Pregrado', pct: 45.5 },
    { label: 'Posgrado', pct: 32.9 },
    { label: 'OPT (práctica laboral)', pct: 16.7 },
    { label: 'Programas sin grado', pct: 4.9 },
  ],
  source_id: 'src-opendoors-pe-2024',
};

/** Etiqueta legible de una opción de lista corta. */
export function targetLabel(target: 'program' | 'institution' | 'scholarship', id: string) {
  if (target === 'program') {
    const p = programById.get(id);
    const i = p && institutionById.get(p.institution_id);
    return { title: p?.name ?? id, subtitle: i ? `${i.short_name} · ${i.city}` : '', country: i?.country };
  }
  if (target === 'institution') {
    const i = institutionById.get(id);
    return { title: i?.name ?? id, subtitle: i ? `${i.city}, ${i.region}` : '', country: i?.country };
  }
  const s = scholarshipById.get(id);
  return { title: s?.name ?? id, subtitle: s?.provider ?? '', country: s?.study_country === 'varios' ? undefined : s?.study_country };
}

/** Todas las fechas publicadas (becas y admisiones), con su fuente y estado. */
export interface DatedItem {
  id: string;
  label: string;
  date: string;
  kind: 'beca' | 'admision';
  ref: string;
  status: 'verificado' | 'por_verificar';
  source_id?: string;
  note?: string;
}

export function allDates(): DatedItem[] {
  const out: DatedItem[] = [];
  for (const s of scholarships) {
    if (s.window.opens.value)
      out.push({ id: `${s.id}-opens`, label: `${s.name}: abre postulación`, date: s.window.opens.value, kind: 'beca', ref: s.id, status: s.window.opens.status, source_id: s.window.opens.source_id, note: s.window.opens.note });
    if (s.window.closes.value)
      out.push({ id: `${s.id}-closes`, label: `${s.name}: cierre de postulación`, date: s.window.closes.value, kind: 'beca', ref: s.id, status: s.window.closes.status, source_id: s.window.closes.source_id, note: s.window.closes.note });
    s.other_dates?.value?.forEach((d, i) =>
      out.push({ id: `${s.id}-o${i}`, label: d.label, date: d.date, kind: 'beca', ref: s.id, status: s.other_dates!.status, source_id: s.other_dates!.source_id, note: s.other_dates!.note }),
    );
  }
  for (const m of admissionModes) {
    m.next_dates.value?.forEach((d, i) =>
      out.push({ id: `${m.id}-${i}`, label: d.label, date: d.date, kind: 'admision', ref: m.institution_id, status: m.next_dates.status, source_id: m.next_dates.source_id, note: m.next_dates.note }),
    );
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
