// Modelo de datos de Cooper Compass (sección 8 del HANDOFF).
// Todo dato institucional va envuelto en Fact<T>: ningún valor aparece sin fuente.

export type VerificationStatus = 'verificado' | 'por_verificar';

export interface Source {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** ISO 8601. null = registrada pero todavía no consultada en esta versión. */
  checked_at: string | null;
  status: VerificationStatus;
}

export interface Fact<T> {
  value: T | null; // null = no encontrado → la interfaz muestra «Por verificar»
  source_id?: string;
  note?: string;
  status: VerificationStatus;
}

export type Country = 'PE' | 'US' | 'UK';
export type Level = 'pregrado' | 'posgrado';

export interface Tuition {
  min?: number;
  max?: number;
  currency: 'PEN' | 'USD' | 'GBP';
  period: 'ciclo' | 'año' | 'mes';
}

export interface Institution {
  id: string;
  name: string;
  short_name: string;
  country: Country;
  city: string;
  region: string;
  management: 'publica' | 'privada';
  website: string;
  sunedu_licensed?: Fact<boolean>;
  tuition: Fact<Tuition>;
  intl_aid?: Fact<'need_blind' | 'need_aware' | 'merito' | 'limitada'>;
  /** Extensión: requisito de inglés publicado (texto tal como lo publica la universidad). */
  english_requirement?: Fact<string>;
  /** Extensión: certificaciones de inglés aceptadas (ids de credentials). */
  english_tests?: Fact<string[]>;
  /** Extensión: exámenes de admisión generales (SAT/ACT en EE. UU.; TMUA, LNAT o UGAA en el Reino Unido). */
  test_policy?: Fact<string>;
  /** Extensión: ¿acepta el certificado de secundaria del Perú para el ingreso directo? */
  local_diploma?: Fact<string>;
  tags: string[];
}

export interface Program {
  id: string;
  institution_id: string;
  name: string;
  area: string;
  level: Level;
  duration: Fact<string>;
  language_of_instruction: 'es' | 'en';
  riasec: string;
  career_paths: string[];
  source_id: string;
}

export interface AdmissionMode {
  id: string;
  institution_id: string;
  name: string;
  for_whom: string;
  key_requirements: Fact<string[]>;
  next_dates: Fact<{ label: string; date: string }[]>;
}

export type ScholarshipStatus = 'abierta' | 'proxima' | 'cerrada' | 'suspendida' | 'por_confirmar';

export interface Scholarship {
  id: string;
  name: string;
  provider: string;
  study_country: Country | 'varios';
  levels: Level[];
  coverage: Fact<string>;
  requirements: Fact<string[]>;
  language_requirement: Fact<string>;
  window: { opens: Fact<string>; closes: Fact<string> };
  /** Extensión: otras fechas publicadas (examen, resultados). */
  other_dates?: Fact<{ label: string; date: string }[]>;
  status: ScholarshipStatus;
  /** Extensión: «institucional» = política de ayuda de una universidad, no una convocatoria. */
  kind?: 'convocatoria' | 'institucional';
  institution_id?: string;
  source_id: string;
}

export interface Credential {
  id: string;
  name: string;
  kind: 'idioma' | 'admision';
  language?: string;
  provider: string;
  format: Fact<string>;
  validity: Fact<string>;
  source_id: string;
}

export type Priority = 'afinidad' | 'interes' | 'idioma' | 'costo' | 'ubicacion';
export type Pipeline = 'descubrimiento' | 'perfil' | 'exploracion' | 'lista_corta' | 'postulacion' | 'resultado';
export type ShortlistStatus = 'explorando' | 'preparando' | 'postulado' | 'resultado';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Riasec = { R: number; I: number; A: number; S: number; E: number; C: number };

export interface ShortlistItem {
  target: 'program' | 'institution' | 'scholarship';
  id: string;
  status: ShortlistStatus;
  /** Extensión: casillas del checklist marcadas por la asesora. */
  checks?: Record<string, boolean>;
}

export interface Student {
  id: string;
  alias: string;
  stage: 'escolar_4to' | 'escolar_5to' | 'egresado_escolar' | 'universitario' | 'egresado_universitario';
  region: string;
  target_countries: Country[];
  budget_band: 'bajo' | 'medio' | 'alto' | 'requiere_beca';
  english_cefr: Cefr;
  other_languages: { language: string; cefr: string }[];
  credentials_held: string[];
  riasec: Riasec;
  strengths: string[];
  dream_work: { text: string; sectors: string[] };
  purpose: { ama: string; bueno: string; mundo: string; pagarian: string };
  /**
   * Orden de «Lo que más le importa». Nota: el HANDOFF listaba «duración» y «nivel»,
   * pero el cálculo tiene cinco factores; aquí cada prioridad corresponde a un factor.
   */
  priorities: Priority[];
  shortlist: ShortlistItem[];
  pipeline: Pipeline;
  notes: string;
  is_fictional: true;
}
