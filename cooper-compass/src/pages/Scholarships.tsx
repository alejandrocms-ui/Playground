import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { allDates, scholarships } from '../lib/data';
import type { ScholarshipStatus } from '../types';
import { fmtDate, relDays, urgency } from '../lib/format';
import { Badge, CountryTag, FactLine, PageHeader, SourceLink, UrgencyDot, cx, urgencyTone } from '../components/ui';

const STATUS: Record<ScholarshipStatus, { label: string; tone: 'teal' | 'gold' | 'grey' | 'coral' }> = {
  abierta: { label: 'Abierta', tone: 'teal' },
  proxima: { label: 'Próxima', tone: 'gold' },
  cerrada: { label: 'Cerrada', tone: 'grey' },
  suspendida: { label: 'Suspendida', tone: 'coral' },
  por_confirmar: { label: 'Por confirmar', tone: 'grey' },
};

export default function ScholarshipsPage() {
  const [view, setView] = useState<'lista' | 'calendario'>('lista');
  const order: ScholarshipStatus[] = ['abierta', 'proxima', 'por_confirmar', 'cerrada', 'suspendida'];
  const list = [...scholarships].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.window.closes.value ?? '9').localeCompare(b.window.closes.value ?? '9'));
  return (
    <div className="fade-in">
      <PageHeader
        title="Becas y fechas"
        subtitle="Cada beca con su ventana de postulación, su estado y el enlace oficial de donde sale el dato."
        right={
          <div className="flex rounded-xl border border-line bg-paper p-1">
            <button aria-pressed={view === 'lista'} onClick={() => setView('lista')} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'lista' && 'bg-grey-soft font-semibold')}><List size={15} aria-hidden /> Lista</button>
            <button aria-pressed={view === 'calendario'} onClick={() => setView('calendario')} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'calendario' && 'bg-grey-soft font-semibold')}><CalendarDays size={15} aria-hidden /> Calendario</button>
          </div>
        }
      />
      {view === 'lista' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {list.map((s) => {
            const closes = s.window.closes.value;
            const u = closes ? urgency(closes) : null;
            return (
              <article key={s.id} className="card flex flex-col p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold leading-snug">{s.name}</h2>
                    <p className="text-sm text-muted">{s.provider}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    <CountryTag country={s.study_country} />
                    {s.levels.map((l) => <Badge key={l}>{l === 'pregrado' ? 'Pregrado' : 'Posgrado'}</Badge>)}
                    {s.kind === 'institucional' && <Badge tone="sky" title="Política de ayuda de la universidad, no una convocatoria">Política institucional</Badge>}
                  </div>
                </div>
                {closes && u && u !== 'pasado' && (
                  <div className={cx('mt-4 flex items-center gap-3 rounded-xl px-4 py-3', u === 'urgente' ? 'bg-coral-soft' : u === 'pronto' ? 'bg-gold-soft' : 'bg-teal-soft')}>
                    <UrgencyDot iso={closes} />
                    <div className="text-sm">
                      <span className="font-semibold">Cierra el {fmtDate(closes)}</span> · {relDays(closes)}
                      {s.window.opens.value && <span className="text-muted"> · abrió el {fmtDate(s.window.opens.value)}</span>}
                    </div>
                    <Badge tone={urgencyTone(u)}>{u === 'urgente' ? 'Urgente' : u === 'pronto' ? 'Pronto' : 'Con tiempo'}</Badge>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-1 gap-x-6 md:grid-cols-2">
                  <FactLine label="Cobertura publicada" fact={s.coverage} />
                  <FactLine label="Ventana de postulación" fact={s.window.closes.value ? { ...s.window.closes, value: `${s.window.opens.value ? fmtDate(s.window.opens.value) : 'Apertura por verificar'} → ${fmtDate(s.window.closes.value)}` } : s.window.closes} />
                  <FactLine label="Requisitos publicados" fact={s.requirements} render={(v) => <ul className="list-disc space-y-0.5 pl-4">{v.map((x) => <li key={x}>{x}</li>)}</ul>} />
                  <FactLine label="Idioma" fact={s.language_requirement} />
                </div>
                {s.other_dates?.value && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.other_dates.value.map((d) => <Badge key={d.label} tone="grey">{d.label}: {fmtDate(d.date)}</Badge>)}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                  <SourceLink id={s.source_id} />
                  <span className="text-[11px] text-muted">Un requisito publicado no anticipa el resultado</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Calendar />
      )}
    </div>
  );
}

function Calendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const dates = useMemo(() => allDates(), []);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const today = new Date();
  const label = format(month, "MMMM 'de' yyyy", { locale: es });
  return (
    <section className="card p-5" aria-label={`Calendario de ${label}`}>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior" className="rounded-lg p-2 hover:bg-grey-soft"><ChevronLeft size={18} aria-hidden /></button>
        <h2 className="text-xl font-semibold capitalize">{label}</h2>
        <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente" className="rounded-lg p-2 hover:bg-grey-soft"><ChevronRight size={18} aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const ev = dates.filter((x) => isSameDay(parseISO(x.date), d));
          return (
            <div key={d.toISOString()} className={cx('min-h-[96px] rounded-lg border p-1.5 text-left', isSameMonth(d, month) ? 'border-line bg-paper' : 'border-transparent bg-cream text-muted/60', isSameDay(d, today) && 'ring-2 ring-gold')}>
              <div className="text-xs font-semibold">{format(d, 'd')}</div>
              <div className="mt-1 space-y-1">
                {ev.map((e) => {
                  const u = urgency(e.date);
                  return (
                    <div key={e.id} title={`${e.label}${e.status === 'por_verificar' ? ' (por verificar)' : ''}`} className={cx('truncate rounded px-1.5 py-0.5 text-[11px] font-medium', u === 'urgente' ? 'bg-coral-soft text-coral-ink' : u === 'pronto' ? 'bg-gold-soft text-gold-ink' : u === 'tranquilo' ? 'bg-teal-soft text-teal-ink' : 'bg-grey-soft text-muted')}>
                      {e.label}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
