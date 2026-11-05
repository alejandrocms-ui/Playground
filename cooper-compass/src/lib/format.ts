import { differenceInCalendarDays, format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Tuition } from '../types';

/** «13 de nov. de 2026» */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'Por verificar';
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  const month = format(d, 'MMM', { locale: es }).replace('.', '');
  const m = month === 'may' ? month : `${month}.`;
  return `${format(d, 'd')} de ${m} de ${format(d, 'yyyy')}`;
}

export function fmtLongToday(now = new Date()): string {
  const s = format(now, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function daysUntil(iso: string, now = new Date()): number {
  return differenceInCalendarDays(parseISO(iso), now);
}

export type Urgency = 'urgente' | 'pronto' | 'tranquilo' | 'pasado';
/** Semáforo: coral < 14 días · dorado 14–45 · teal > 45. */
export function urgency(iso: string, now = new Date()): Urgency {
  const d = daysUntil(iso, now);
  if (d < 0) return 'pasado';
  if (d < 14) return 'urgente';
  if (d <= 45) return 'pronto';
  return 'tranquilo';
}

export function relDays(iso: string, now = new Date()): string {
  const d = daysUntil(iso, now);
  if (d < 0) return `hace ${Math.abs(d)} día${d === -1 ? '' : 's'}`;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `en ${d} días`;
}

const nf = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
/** «USD 12 345 por año», «S/ 1 234 por ciclo». Solo se usa con montos que vienen de la fuente. */
export function fmtTuition(t: Tuition | null): string {
  if (!t) return 'Por verificar';
  const cur = t.currency === 'PEN' ? 'S/' : t.currency === 'GBP' ? '£' : 'USD';
  const amt = (n: number) => nf.format(n).replace(/[.,]/g, ' ');
  const range = t.min != null && t.max != null && t.min !== t.max ? `${amt(t.min)}–${amt(t.max)}` : amt((t.min ?? t.max)!);
  return t.currency === 'GBP' ? `£${range} por ${t.period}` : `${cur} ${range} por ${t.period}`;
}

export const stageLabel: Record<string, string> = {
  escolar_4to: '4.º de secundaria',
  escolar_5to: '5.º de secundaria',
  egresado_escolar: 'Egresado escolar',
  universitario: 'Universitario',
  egresado_universitario: 'Egresado universitario',
};

export const budgetLabel: Record<string, string> = {
  bajo: 'Presupuesto bajo',
  medio: 'Presupuesto medio',
  alto: 'Presupuesto alto',
  requiere_beca: 'Requiere beca',
};

export const countryLabel = { PE: 'Perú', US: 'EE. UU.', UK: 'Reino Unido' } as const;
