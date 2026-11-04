import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { Bookmark, CalendarClock, GraduationCap, Users } from 'lucide-react';
import { useStore } from '../store';
import type { Pipeline, Student } from '../types';
import { allDates, openDoors, scholarships } from '../lib/data';
import { daysUntil, fmtDate, fmtLongToday, relDays } from '../lib/format';
import { topRiasec } from '../lib/matching';
import { Avatar, Badge, CountryTag, FictionalTag, SourceLink, Tip, UrgencyDot, VerifyBadge, GLOSSARY, cx } from '../components/ui';
import { announcements, columnKeyboardCoordinates, screenReaderInstructions, useDndSensors } from '../components/dnd';

export const PIPELINE: { id: Pipeline; label: string }[] = [
  { id: 'descubrimiento', label: 'Descubrimiento' },
  { id: 'perfil', label: 'Perfil' },
  { id: 'exploracion', label: 'Exploración' },
  { id: 'lista_corta', label: 'Lista corta' },
  { id: 'postulacion', label: 'Postulación' },
  { id: 'resultado', label: 'Resultado' },
];

export default function HomePage() {
  const students = useStore((s) => s.students);
  const now = new Date();
  const dates = useMemo(() => allDates(), []);
  const upcoming = dates.filter((d) => daysUntil(d.date, now) >= 0);
  const in14 = upcoming.filter((d) => daysUntil(d.date, now) < 14);
  const open = scholarships.filter((s) => s.status === 'abierta' && s.kind !== 'institucional');
  const saved = students.reduce((a, s) => a + s.shortlist.length, 0);
  const active = students.filter((s) => s.pipeline !== 'resultado').length;

  return (
    <div className="fade-in space-y-6">
      <div>
        <p className="text-sm font-medium text-gold-ink">{fmtLongToday(now)}</p>
        <h1 className="mt-1 text-4xl font-semibold">Hola, ¿a quién orientamos hoy?</h1>
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={Users} label="Estudiantes activos" value={active} />
        <Kpi icon={GraduationCap} label="Becas abiertas ahora" value={open.length} hint={open.map((s) => s.name).join(' · ')} />
        <Kpi icon={CalendarClock} label="Fechas límite en 14 días" value={in14.length} tone={in14.length ? 'coral' : undefined} />
        <Kpi icon={Bookmark} label="Opciones en listas cortas" value={saved} />
      </section>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_380px]">
        <Kanban students={students} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          <Timeline items={upcoming.slice(0, 7)} />
          <OpenDoorsCard />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Users; label: string; value: number; hint?: string; tone?: 'coral' }) {
  return (
    <div className="card flex items-center gap-4 p-5" title={hint}>
      <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl', tone === 'coral' ? 'bg-coral-soft text-coral-ink' : 'bg-gold-soft text-gold-ink')}>
        <Icon size={20} aria-hidden />
      </span>
      <div>
        <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm text-muted">{label}</div>
      </div>
    </div>
  );
}

function Timeline({ items }: { items: ReturnType<typeof allDates> }) {
  const go = useStore((s) => s.go);
  return (
    <section className="card p-5" aria-labelledby="tl-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="tl-title" className="text-lg font-semibold">
          Próximas fechas
        </h2>
        <button className="text-xs font-medium text-sky underline underline-offset-2" onClick={() => go('becas')}>
          Ver todas
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-coral" /> menos de 14 días</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> 14 a 45 días</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" /> más de 45 días</span>
      </div>
      <ol className="relative space-y-3 border-l border-line pl-4">
        {items.map((d) => (
          <li key={d.id} className="relative">
            <span className="absolute -left-[22px] top-1.5">
              <UrgencyDot iso={d.date} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium leading-snug">{d.label}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-semibold text-navy">{fmtDate(d.date)}</span>
              <span>· {relDays(d.date)}</span>
              {d.status === 'por_verificar' && <VerifyBadge status="por_verificar" />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OpenDoorsCard() {
  return (
    <section className="card overflow-hidden" aria-labelledby="od-title">
      <div className="bg-navy px-5 py-4 text-cream">
        <p className="text-xs uppercase tracking-wide text-cream/75">Contexto · Open Doors {openDoors.year}</p>
        <h2 id="od-title" className="mt-1 text-2xl font-semibold">
          {openDoors.total.toLocaleString('es-PE').replace(',', ' ')} estudiantes peruanos en EE. UU.
        </h2>
      </div>
      <div className="space-y-2 p-5">
        {openDoors.split.map((r) => (
          <div key={r.label} className="text-sm">
            <div className="flex justify-between">
              <span>{r.label === 'OPT (práctica laboral)' ? <Tip text={GLOSSARY.OPT}>OPT (práctica laboral)</Tip> : r.label}</span>
              <span className="font-semibold tabular-nums">{r.pct.toLocaleString('es-PE')} %</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-grey-soft">
              <div className="h-full rounded-full bg-sky" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
        <div className="pt-2">
          <SourceLink id={openDoors.source_id} />
          <p className="mt-1 text-[11px] text-muted">Es la ficha de Perú más reciente que encontramos; no hallamos una edición 2025.</p>
        </div>
      </div>
    </section>
  );
}

// ---------- Tablero de etapas (kanban) ----------

function Kanban({ students }: { students: Student[] }) {
  const setPipeline = useStore((s) => s.setPipeline);
  const notify = useStore((s) => s.notify);
  const sensors = useDndSensors(columnKeyboardCoordinates('col:'));
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = students.find((s) => `stu:${s.id}` === activeId);

  const name = (id: string | number) => {
    const s = String(id);
    if (s.startsWith('stu:')) return students.find((x) => `stu:${x.id}` === s)?.alias ?? s;
    if (s.startsWith('col:')) return `la columna ${PIPELINE.find((p) => `col:${p.id}` === s)?.label}`;
    return s;
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const sid = String(e.active.id).slice(4);
    const col = String(e.over.id).slice(4) as Pipeline;
    const st = students.find((x) => x.id === sid);
    if (st && st.pipeline !== col) {
      setPipeline(sid, col);
      notify(`${st.alias} pasó a ${PIPELINE.find((p) => p.id === col)?.label}.`);
    }
  };

  return (
    <section className="card p-5" aria-labelledby="kb-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kb-title" className="text-lg font-semibold">
          Estudiantes por etapa
        </h2>
        <p className="text-xs text-muted">Arrastra una tarjeta para cambiar su etapa (con teclado: espacio, flechas ← → y espacio).</p>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{ announcements: announcements(name), screenReaderInstructions }}
      >
        <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
          {PIPELINE.map((col) => (
            <Column key={col.id} id={col.id} label={col.label} students={students.filter((s) => s.pipeline === col.id)} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180 }}>{active ? <StudentCard s={active} overlay /> : null}</DragOverlay>
      </DndContext>
    </section>
  );
}

function Column({ id, label, students }: { id: Pipeline; label: string; students: Student[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex min-h-[220px] flex-col rounded-xl border-2 p-2 transition-colors duration-150',
        isOver ? 'border-gold bg-gold-soft' : 'border-transparent bg-cream',
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
        <span className="rounded-full bg-paper px-2 text-xs font-semibold text-muted">{students.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {students.map((s) => (
          <DraggableStudent key={s.id} s={s} />
        ))}
        {students.length === 0 && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">Arrastra aquí</div>}
      </div>
    </div>
  );
}

function DraggableStudent({ s }: { s: Student }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `stu:${s.id}` });
  const go = useStore((st) => st.go);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="tarjeta arrastrable"
      aria-label={`${s.alias}: tarjeta de estudiante. Doble clic para abrir su ficha.`}
      onDoubleClick={() => go('estudiantes', s.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'o') go('estudiantes', s.id);
      }}
      className={cx('touch-none', isDragging && 'opacity-30')}
    >
      <StudentCard s={s} />
    </div>
  );
}

function StudentCard({ s, overlay }: { s: Student; overlay?: boolean }) {
  const go = useStore((st) => st.go);
  return (
    <div
      className={cx(
        'cursor-grab rounded-xl border border-line bg-paper p-2.5 text-left active:cursor-grabbing',
        overlay ? 'rotate-2 shadow-[var(--shadow-lift)]' : 'shadow-sm hover:border-gold',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar alias={s.alias} size={28} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{s.alias}</div>
          <div className="text-[11px] text-muted">{topRiasec(s.riasec)} · {s.region}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {s.target_countries.map((c) => (
          <CountryTag key={c} country={c} />
        ))}
      </div>
      {!overlay && (
        <div className="mt-2 flex items-center justify-between">
          <FictionalTag />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => go('estudiantes', s.id)}
            className="text-[11px] font-medium text-sky underline underline-offset-2"
            aria-label={`Abrir ficha de ${s.alias}`}
          >
            Ficha
          </button>
        </div>
      )}
      {overlay && <Badge tone="gold">Moviendo…</Badge>}
    </div>
  );
}

