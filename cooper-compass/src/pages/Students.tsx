import { useMemo, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { ArrowLeft, ChevronDown, GripVertical, Plus, Trash2, Sparkles, CircleAlert, ListChecks } from 'lucide-react';
import { useStore, useStudent } from '../store';
import type { Priority, ShortlistItem, ShortlistStatus, Student } from '../types';
import { institutionById, modesByInstitution, programById, scholarshipById, targetLabel } from '../lib/data';
import { budgetLabel, countryLabel, fmtDate, stageLabel } from '../lib/format';
import { PRIORITY_LABEL, RIASEC_LABEL, WEIGHTS, matchAny, topMatches, topRiasec, type MatchResult } from '../lib/matching';
import { Avatar, Badge, Button, CountryTag, Empty, FictionalTag, GLOSSARY, NO_ELIGIBILITY, PageHeader, ScoreBar, SourceLink, Tip, VerifyBadge, cx } from '../components/ui';
import { announcements, screenReaderInstructions, useDndSensors } from '../components/dnd';
import { PIPELINE } from './Home';
import NewStudentForm from './NewStudent';

export default function StudentsPage() {
  const studentId = useStore((s) => s.studentId);
  const students = useStore((s) => s.students);
  const go = useStore((s) => s.go);
  const [creating, setCreating] = useState(false);

  if (studentId) return <StudentDetail id={studentId} />;
  if (creating) return <NewStudentForm onDone={(id) => { setCreating(false); if (id) go('estudiantes', id); }} />;

  return (
    <div className="fade-in">
      <PageHeader
        title="Estudiantes"
        subtitle="Cada ficha cruza el perfil del estudiante con universidades, carreras y becas."
        right={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> Agrega un estudiante
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {students.map((s) => (
          <button key={s.id} onClick={() => go('estudiantes', s.id)} className="card p-5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-gold">
            <div className="flex items-start gap-3">
              <Avatar alias={s.alias} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-semibold">{s.alias}</span>
                  <FictionalTag />
                </div>
                <div className="text-sm text-muted">
                  {stageLabel[s.stage]} · {s.region}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="navy">{PIPELINE.find((p) => p.id === s.pipeline)?.label}</Badge>
              {s.target_countries.map((c) => (
                <CountryTag key={c} country={c} />
              ))}
              <Badge tone="gold" title={topRiasec(s.riasec).split('').map((l) => RIASEC_LABEL[l]).join(', ')}>
                RIASEC {topRiasec(s.riasec)}
              </Badge>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted">{s.dream_work.text}</p>
            <div className="mt-3 text-sm font-medium">
              {s.shortlist.length} {s.shortlist.length === 1 ? 'opción guardada' : 'opciones guardadas'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Ficha ----------------

function StudentDetail({ id }: { id: string }) {
  const s = useStudent(id);
  const go = useStore((st) => st.go);
  if (!s) return <Empty>No encontramos este estudiante.</Empty>;

  return (
    <div className="fade-in space-y-6">
      <button onClick={() => go('estudiantes')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft size={16} aria-hidden /> Estudiantes
      </button>

      <header className="card flex flex-wrap items-center gap-5 p-6">
        <Avatar alias={s.alias} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{s.alias}</h1>
            <FictionalTag />
            <Badge tone="navy">{PIPELINE.find((p) => p.id === s.pipeline)?.label}</Badge>
          </div>
          <p className="mt-1 text-muted">
            {stageLabel[s.stage]} · {s.region} · {budgetLabel[s.budget_band]} · Inglés {s.english_cefr}
            {s.other_languages.map((l) => ` · ${l.language} ${l.cefr}`).join('')}
          </p>
          <p className="mt-2 max-w-3xl text-sm">
            <span className="font-semibold">Trabajo soñado:</span> {s.dream_work.text}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.target_countries.map((c) => (
            <CountryTag key={c} country={c} />
          ))}
          {s.strengths.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RiasecCard s={s} />
            <PurposeCard s={s} />
          </div>
          <Matches s={s} />
        </div>
        <div className="space-y-6">
          <Priorities s={s} />
          <Shortlist s={s} />
          <Notes s={s} />
        </div>
      </div>
    </div>
  );
}

function RiasecCard({ s }: { s: Student }) {
  const data = (Object.keys(RIASEC_LABEL) as (keyof Student['riasec'])[]).map((k) => ({ k: RIASEC_LABEL[k], v: s.riasec[k] }));
  return (
    <section className="card p-5" aria-labelledby="rc-title">
      <h2 id="rc-title" className="text-lg font-semibold">
        <Tip text={GLOSSARY.RIASEC}>Intereses (RIASEC)</Tip>
      </h2>
      <div className="h-64" role="img" aria-label={`Radar de intereses: ${data.map((d) => `${d.k} ${d.v}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="62%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="#E8E1D4" />
            <PolarAngleAxis dataKey="k" tick={{ fill: '#16213E', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
            <Radar dataKey="v" stroke="#1F6E66" fill="#2A8C82" fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-muted">
        Código principal: <span className="font-semibold text-navy">{topRiasec(s.riasec).split('').map((l) => RIASEC_LABEL[l]).join(' · ')}</span>
      </p>
    </section>
  );
}

function PurposeCard({ s }: { s: Student }) {
  const q = [
    { t: 'Lo que ama', v: s.purpose.ama, c: 'bg-coral-soft' },
    { t: 'En lo que es bueno', v: s.purpose.bueno, c: 'bg-gold-soft' },
    { t: 'Lo que el mundo necesita', v: s.purpose.mundo, c: 'bg-teal-soft' },
    { t: 'Por lo que le pagarían', v: s.purpose.pagarian, c: 'bg-sky-soft' },
  ];
  return (
    <section className="card p-5" aria-labelledby="pc-title">
      <h2 id="pc-title" className="mb-3 text-lg font-semibold">
        Propósito
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {q.map((x) => (
          <div key={x.t} className={cx('rounded-xl p-3', x.c)}>
            <div className="text-xs font-semibold uppercase tracking-wide text-navy/80">{x.t}</div>
            <p className="mt-1 text-sm leading-snug">{x.v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Matches({ s }: { s: Student }) {
  const { programs, scholarships } = useMemo(() => topMatches(s), [s]);
  return (
    <section className="card p-5" aria-labelledby="m-title">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="m-title" className="text-lg font-semibold">
          Opciones que encajan
        </h2>
        <span className="text-xs text-muted">{NO_ELIGIBILITY}</span>
      </div>
      <p className="mb-4 text-sm text-muted">Se recalculan en vivo según el orden de «Lo que más le importa».</p>
      <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted">Carreras y universidades</h3>
      <div className="space-y-3">
        {programs.map((m) => (
          <MatchRow key={m.id} s={s} m={m} />
        ))}
      </div>
      <h3 className="mb-2 mt-6 font-sans text-xs font-semibold uppercase tracking-wide text-muted">Becas y ayudas</h3>
      <div className="space-y-3">
        {scholarships.map((m) => (
          <MatchRow key={m.id} s={s} m={m} />
        ))}
      </div>
    </section>
  );
}

function MatchRow({ s, m }: { s: Student; m: MatchResult }) {
  const add = useStore((st) => st.addToShortlist);
  const notify = useStore((st) => st.notify);
  const t = targetLabel(m.kind, m.id);
  const inList = s.shortlist.some((x) => x.target === m.kind && x.id === m.id);
  return (
    <article className="rounded-xl border border-line p-4 transition-colors duration-150 hover:border-gold/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t.title}</span>
            <CountryTag country={t.country} />
          </div>
          <div className="text-sm text-muted">{t.subtitle}</div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBar score={m.score} />
          <Button
            variant="soft"
            className="px-2.5 py-1.5 text-xs"
            disabled={inList}
            onClick={() => {
              if (add(s.id, { target: m.kind, id: m.id })) notify(`${t.title} se agregó a la lista corta de ${s.alias}.`);
            }}
          >
            {inList ? 'En su lista' : <><Plus size={14} aria-hidden /> Lista corta</>}
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-teal-ink">
            <Sparkles size={13} aria-hidden /> Por qué aparece
          </div>
          <ul className="space-y-1 text-sm">
            {m.reasons.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal" />{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-gold-ink">
            <CircleAlert size={13} aria-hidden /> Qué falta revisar
          </div>
          <ul className="space-y-1 text-sm text-muted">
            {m.checks.map((r) => (
              <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

// ---------- Lo que más le importa ----------

function SortableRow({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('relative flex items-center gap-2 rounded-xl border bg-paper', isDragging ? 'z-10 border-gold shadow-[var(--shadow-lift)]' : 'border-line')}
    >
      <button {...attributes} {...listeners} aria-label={`Mover ${label}`} className="flex cursor-grab touch-none items-center self-stretch rounded-l-xl px-2 text-muted hover:bg-grey-soft active:cursor-grabbing">
        <GripVertical size={16} aria-hidden />
      </button>
      <div className="min-w-0 flex-1 py-2 pr-3">{children}</div>
    </li>
  );
}

function Priorities({ s }: { s: Student }) {
  const setPriorities = useStore((st) => st.setPriorities);
  const sensors = useDndSensors();
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = s.priorities.indexOf(e.active.id as Priority);
    const to = s.priorities.indexOf(e.over.id as Priority);
    setPriorities(s.id, arrayMove(s.priorities, from, to));
  };
  return (
    <section className="card p-5" aria-labelledby="pr-title">
      <h2 id="pr-title" className="text-lg font-semibold">
        Lo que más le importa
      </h2>
      <p className="mb-3 text-sm text-muted">Arrastra para reordenar. El primero pesa más en la coincidencia.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onEnd}
        accessibility={{ announcements: announcements((id) => PRIORITY_LABEL[id as Priority] ?? String(id)), screenReaderInstructions }}
      >
        <SortableContext items={s.priorities} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {s.priorities.map((p, i) => (
              <SortableRow key={p} id={p} label={PRIORITY_LABEL[p]}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {i + 1}. {PRIORITY_LABEL[p]}
                  </span>
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-gold-ink">{WEIGHTS[i]} %</span>
                </div>
              </SortableRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

// ---------- Lista corta ----------

const STATUS: { id: ShortlistStatus; label: string }[] = [
  { id: 'explorando', label: 'Explorando' },
  { id: 'preparando', label: 'Preparando' },
  { id: 'postulado', label: 'Postulado' },
  { id: 'resultado', label: 'Resultado' },
];

const keyOf = (x: ShortlistItem) => `${x.target}:${x.id}`;

function Shortlist({ s }: { s: Student }) {
  const setShortlist = useStore((st) => st.setShortlist);
  const sensors = useDndSensors();
  const ids = s.shortlist.map(keyOf);
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setShortlist(s.id, arrayMove(s.shortlist, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <section className="card p-5" aria-labelledby="sl-title">
      <h2 id="sl-title" className="text-lg font-semibold">
        Lista corta
      </h2>
      <p className="mb-3 text-sm text-muted">Arrastra para cambiar la prioridad. Abre cada opción para ver su checklist.</p>
      {s.shortlist.length === 0 ? (
        <Empty>Todavía no hay opciones en su lista corta. Arrastra una desde Explorar.</Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onEnd}
          accessibility={{ announcements: announcements((id) => { const [t, i] = String(id).split(':'); return targetLabel(t as ShortlistItem['target'], i).title; }), screenReaderInstructions }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {s.shortlist.map((x, i) => (
                <ShortlistRow key={keyOf(x)} s={s} x={x} index={i} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function ShortlistRow({ s, x, index }: { s: Student; x: ShortlistItem; index: number }) {
  const [open, setOpen] = useState(false);
  const setStatus = useStore((st) => st.setShortlistStatus);
  const remove = useStore((st) => st.removeFromShortlist);
  const t = targetLabel(x.target, x.id);
  const m = matchAny(s, x.target, x.id);
  return (
    <SortableRow id={keyOf(x)} label={t.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug">{index + 1}. {t.title}</div>
          <div className="text-xs text-muted">{t.subtitle}</div>
        </div>
        {m && <span className="shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-teal-ink" title="Coincidencia orientativa">{m.score}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`st-${keyOf(x)}`}>Estado</label>
        <select
          id={`st-${keyOf(x)}`}
          value={x.status}
          onChange={(e) => setStatus(s.id, index, e.target.value as ShortlistStatus)}
          className="rounded-lg border border-line bg-cream px-2 py-1 text-xs"
        >
          {STATUS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-grey-soft">
          <ListChecks size={14} aria-hidden /> Checklist <ChevronDown size={12} className={cx('transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        <button onClick={() => remove(s.id, index)} aria-label={`Quitar ${t.title} de la lista corta`} className="ml-auto rounded-lg p-1 text-muted hover:bg-coral-soft hover:text-coral-ink">
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
      {open && <Checklist s={s} x={x} index={index} />}
    </SortableRow>
  );
}

interface CheckItem { key: string; text: string; status: 'verificado' | 'por_verificar'; source_id?: string; group: string }

function checklistFor(x: ShortlistItem, s: Student): CheckItem[] {
  const out: CheckItem[] = [];
  if (x.target === 'scholarship') {
    const b = scholarshipById.get(x.id);
    if (!b) return out;
    (b.requirements.value ?? []).forEach((r, i) => out.push({ key: `req${i}`, text: r, status: b.requirements.status, source_id: b.requirements.source_id, group: 'Requisitos publicados' }));
    if (!b.requirements.value) out.push({ key: 'req', text: 'Requisitos de la convocatoria', status: 'por_verificar', source_id: b.source_id, group: 'Requisitos publicados' });
    out.push({ key: 'lang', text: b.language_requirement.value ?? 'Requisito de idioma', status: b.language_requirement.value ? b.language_requirement.status : 'por_verificar', source_id: b.language_requirement.source_id, group: 'Idioma' });
    out.push({ key: 'win', text: b.window.closes.value ? `Postular antes del ${fmtDate(b.window.closes.value)}` : 'Fecha de cierre', status: b.window.closes.value ? b.window.closes.status : 'por_verificar', source_id: b.window.closes.source_id ?? b.source_id, group: 'Fechas' });
    return out;
  }
  const instId = x.target === 'program' ? programById.get(x.id)?.institution_id : x.id;
  const inst = instId ? institutionById.get(instId) : undefined;
  if (!inst) return out;
  const modes = modesByInstitution(inst.id);
  modes.slice(0, 2).forEach((m) => {
    (m.key_requirements.value ?? [`Requisitos de ${m.name}`]).forEach((r, i) =>
      out.push({ key: `${m.id}-${i}`, text: r, status: m.key_requirements.value ? m.key_requirements.status : 'por_verificar', source_id: m.key_requirements.source_id, group: `Modalidad: ${m.name}` }),
    );
  });
  if (inst.country === 'US') {
    out.push({ key: 'test', text: inst.test_policy?.value ? `SAT/ACT: ${inst.test_policy.value}` : 'Política de SAT/ACT', status: inst.test_policy?.value ? inst.test_policy.status : 'por_verificar', source_id: inst.test_policy?.source_id, group: 'Exámenes' });
    out.push({ key: 'eng', text: inst.english_requirement?.value ? `Inglés: requisito publicado (${s.english_cefr} actual)` : 'Requisito de inglés', status: inst.english_requirement?.value ? inst.english_requirement.status : 'por_verificar', source_id: inst.english_requirement?.source_id, group: 'Idioma' });
    out.push({ key: 'docs', text: 'Documentos: Common App, cartas y CSS Profile si pide ayuda', status: 'por_verificar', group: 'Documentos' });
  } else {
    out.push({ key: 'docs', text: 'Documentos: certificado de estudios y DNI del postulante', status: 'por_verificar', group: 'Documentos' });
  }
  return out;
}

function Checklist({ s, x, index }: { s: Student; x: ShortlistItem; index: number }) {
  const toggle = useStore((st) => st.toggleCheck);
  const items = checklistFor(x, s);
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</div>
          <ul className="space-y-1.5">
            {items.filter((i) => i.group === g).map((it) => {
              const pv = it.status === 'por_verificar';
              return (
                <li key={it.key} className={cx('flex items-start gap-2 text-sm', pv && 'text-muted')}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[#1F6E66]"
                    checked={!!x.checks?.[it.key]}
                    onChange={() => toggle(s.id, index, it.key)}
                    aria-label={it.text}
                  />
                  <span className="flex-1 leading-snug">
                    {it.text} {pv && <VerifyBadge status="por_verificar" />}
                    {!pv && it.source_id && <span className="ml-1"><SourceLink id={it.source_id} compact /></span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="text-[11px] text-muted">Requisito publicado ≠ decisión de admisión. Confirma siempre en la fuente.</p>
    </div>
  );
}

function Notes({ s }: { s: Student }) {
  const setNotes = useStore((st) => st.setNotes);
  return (
    <section className="card p-5">
      <label htmlFor="notes" className="font-display text-lg font-semibold">
        Notas de la asesora
      </label>
      <textarea
        id="notes"
        value={s.notes}
        onChange={(e) => setNotes(s.id, e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-xl border border-line bg-cream p-3 text-sm focus:border-gold focus:outline-none"
        placeholder="Escribe aquí acuerdos, dudas y próximos pasos."
      />
      <p className="mt-1 text-[11px] text-muted">Se guarda automáticamente en este navegador. País objetivo: {s.target_countries.map((c) => countryLabel[c]).join(', ')}.</p>
    </section>
  );
}
