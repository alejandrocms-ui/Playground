import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleHelp, ExternalLink, Info } from 'lucide-react';
import type { Country, Fact } from '../types';
import { sourceById } from '../lib/data';
import { fmtDate, urgency, type Urgency } from '../lib/format';
import { useStore } from '../store';

export function Logo({ size = 36 }: { size?: number }) {
  // Rosa de los vientos original; la aguja dorada apunta al noreste.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d="M24 4 L26 22 L24 24 L22 22 Z" fill="currentColor" fillOpacity="0.55" transform={`rotate(${a} 24 24)`} />
      ))}
      <path d="M24 24 L39 9 L27.5 26.5 Z" fill="#D99A29" />
      <path d="M24 24 L9 39 L20.5 21.5 Z" fill="currentColor" fillOpacity="0.85" />
      <circle cx="24" cy="24" r="2.5" fill="#FAF6EF" stroke="#D99A29" strokeWidth="1.5" />
    </svg>
  );
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Tone = 'teal' | 'gold' | 'coral' | 'sky' | 'terracotta' | 'moss' | 'grey' | 'navy';
const toneCls: Record<Tone, string> = {
  teal: 'bg-teal-soft text-teal-ink',
  gold: 'bg-gold-soft text-gold-ink',
  coral: 'bg-coral-soft text-coral-ink',
  sky: 'bg-sky-soft text-sky',
  terracotta: 'bg-terracotta-soft text-terracotta',
  moss: 'bg-moss-soft text-moss',
  grey: 'bg-grey-soft text-muted',
  navy: 'bg-navy text-cream',
};

export function Badge({ tone = 'grey', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', toneCls[tone])}>
      {children}
    </span>
  );
}

export function CountryTag({ country }: { country?: Country | 'varios' }) {
  if (country === 'PE') return <Badge tone="terracotta">Perú</Badge>;
  if (country === 'US') return <Badge tone="sky">EE. UU.</Badge>;
  if (country === 'UK') return <Badge tone="moss">Reino Unido</Badge>;
  return <Badge tone="grey">Varios países</Badge>;
}

export function VerifyBadge({ status }: { status: 'verificado' | 'por_verificar' }) {
  return status === 'verificado' ? (
    <Badge tone="teal" title="Dato confirmado en la fuente oficial">
      <CheckCircle2 size={12} aria-hidden /> Verificado
    </Badge>
  ) : (
    <Badge tone="grey" title="Aún no confirmado en la fuente oficial">
      <CircleHelp size={12} aria-hidden /> Por verificar
    </Badge>
  );
}

export function FictionalTag() {
  return (
    <Badge tone="gold" title="Estudiante inventado para la demo. Ningún dato corresponde a una persona real.">
      Perfil ficticio
    </Badge>
  );
}

export function SourceLink({ id, compact = false }: { id?: string; compact?: boolean }) {
  const s = id ? sourceById.get(id) : undefined;
  if (!s) return <span className="text-xs text-muted">Sin fuente registrada</span>;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-sky underline decoration-sky/40 underline-offset-2 hover:decoration-sky"
      title={`${s.publisher}: ${s.title}`}
    >
      <ExternalLink size={12} aria-hidden />
      {compact ? s.publisher : `${s.publisher}`}
      {s.checked_at && !compact && <span className="text-muted no-underline"> · consultado el {fmtDate(s.checked_at)}</span>}
    </a>
  );
}

/** Muestra un Fact: valor + estado + fuente. Si no hay valor, «Por verificar». */
export function FactLine<T>({ label, fact, render }: { label: string; fact?: Fact<T>; render?: (v: T) => ReactNode }) {
  const empty = !fact || fact.value == null || (Array.isArray(fact.value) && fact.value.length === 0);
  return (
    <div className={cx('py-2', empty && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <VerifyBadge status={empty ? 'por_verificar' : fact!.status} />
      </div>
      <div className={cx('mt-1 text-sm', empty ? 'text-muted italic' : 'text-navy')}>
        {empty ? 'Por verificar' : render ? render(fact!.value as T) : String(fact!.value)}
      </div>
      {fact?.note && <p className="mt-1 text-xs text-muted">{fact.note}</p>}
      {fact?.source_id && (
        <div className="mt-1">
          <SourceLink id={fact.source_id} />
        </div>
      )}
    </div>
  );
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      <span tabIndex={0} aria-label={text} className="inline-flex cursor-help text-muted">
        <Info size={13} aria-hidden />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-64 rounded-lg bg-navy px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-cream shadow-lg group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

export const GLOSSARY: Record<string, string> = {
  'need-blind': 'La universidad decide la admisión sin mirar la capacidad de pago del postulante.',
  'Early Action': 'Postulación temprana no vinculante: si te admiten, no estás obligado a matricularte.',
  'Early Decision': 'Postulación temprana vinculante: si te admiten, te comprometes a matricularte.',
  'Regular Action': 'Postulación en el plazo regular (en MIT se llama Regular Action).',
  'Common App': 'Plataforma común para postular a muchas universidades de EE. UU. con un solo formulario.',
  'CSS Profile': 'Formulario que piden muchas universidades privadas de EE. UU. para calcular la ayuda financiera.',
  UCAS: 'Plataforma única para postular a universidades del Reino Unido, con hasta cinco opciones.',
  TMUA: 'Test of Mathematics for University Admission: examen de matemáticas que piden algunas universidades del Reino Unido.',
  LNAT: 'National Admissions Test for Law: examen de admisión para Derecho en algunas universidades del Reino Unido.',
  'A levels': 'Calificación escolar del Reino Unido (dos años, usualmente tres materias). Se califica de A* a E.',
  OPT: 'Optional Practical Training: permiso de práctica laboral en EE. UU. después de estudiar.',
  MCER: 'Marco Común Europeo de Referencia para las lenguas: niveles de A1 a C2.',
  RIASEC: 'Modelo de intereses vocacionales de John Holland: Realista, Investigador, Artístico, Social, Emprendedor y Convencional.',
};

export function urgencyTone(u: Urgency): Tone {
  return u === 'urgente' ? 'coral' : u === 'pronto' ? 'gold' : u === 'tranquilo' ? 'teal' : 'grey';
}

export function UrgencyDot({ iso }: { iso: string }) {
  const u = urgency(iso);
  const cls = u === 'urgente' ? 'bg-coral' : u === 'pronto' ? 'bg-gold' : u === 'tranquilo' ? 'bg-teal' : 'bg-muted/40';
  const label = u === 'urgente' ? 'Menos de 14 días' : u === 'pronto' ? 'Entre 14 y 45 días' : u === 'tranquilo' ? 'Más de 45 días' : 'Fecha pasada';
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', cls)} title={label} aria-label={label} role="img" />;
}

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-teal' : score >= 50 ? 'bg-gold' : 'bg-muted/50';
  return (
    <div className="flex items-center gap-2" aria-label={`Coincidencia ${score} de 100`}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-grey-soft">
        <div className={cx('h-full rounded-full transition-all duration-200', tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' }) {
  const v =
    variant === 'primary'
      ? 'bg-gold text-navy hover:brightness-95 font-semibold'
      : variant === 'soft'
        ? 'bg-paper border border-line text-navy hover:bg-grey-soft'
        : 'text-navy hover:bg-grey-soft';
  return (
    <button {...rest} className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors duration-150 disabled:opacity-50', v, className)}>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2">
      {toast && visible && (
        <div key={toast.id} className="fade-in rounded-xl bg-navy px-4 py-3 text-sm text-cream shadow-lg">
          {toast.text}
        </div>
      )}
    </div>
  );
}

export function Avatar({ alias, size = 36 }: { alias: string; size?: number }) {
  const initials = alias
    .replace('.', '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  // Color estable a partir del alias.
  const palette = ['#1F6E66', '#3D5A98', '#B5473A', '#8A5A00', '#22305A', '#1F6E66'];
  const c = palette[[...alias].reduce((a, ch) => a + ch.charCodeAt(0), 0) % palette.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: c, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export const NO_ELIGIBILITY = 'Coincidencia orientativa. No determina elegibilidad.';
