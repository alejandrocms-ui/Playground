import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, useDraggable, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookmarkPlus, GripVertical, LayoutGrid, Plus, Rows3, X, Filter as FilterIcon, GitCompareArrows } from 'lucide-react';
import { useStore, type ActiveFilter, type FilterKey } from '../store';
import type { AdmissionMode, Credential, Institution, Program, Scholarship } from '../types';
import {
  admissionModes, areas, cities, credentials, institutionById, institutions, modesByInstitution, programs, programsByInstitution, scholarships, sourceById,
} from '../lib/data';
import { daysUntil, fmtDate, fmtTuition } from '../lib/format';
import { Avatar, Badge, Button, CountryTag, Empty, GLOSSARY, PageHeader, SourceLink, Tip, VerifyBadge, cx } from '../components/ui';
import { announcements, screenReaderInstructions, useDndSensors } from '../components/dnd';

type Tab = 'universidades' | 'carreras' | 'modalidades' | 'becas' | 'idiomas';
const TABS: { id: Tab; label: string }[] = [
  { id: 'universidades', label: 'Universidades' },
  { id: 'carreras', label: 'Carreras y programas' },
  { id: 'modalidades', label: 'Modalidades de ingreso' },
  { id: 'becas', label: 'Becas' },
  { id: 'idiomas', label: 'Idiomas y exámenes' },
];

// ---------------- Definición de filtros ----------------

interface Row {
  key: string;
  kind: 'institution' | 'program' | 'mode' | 'scholarship' | 'credential';
  inst?: Institution;
  prog?: Program;
  mode?: AdmissionMode;
  sch?: Scholarship;
  cred?: Credential;
}

interface FilterDef {
  key: FilterKey;
  label: string;
  options?: { value: string; label: string }[];
  text?: boolean;
  tabs: Tab[];
  test: (r: Row, v: string) => boolean;
  sort?: (r: Row) => number | string;
}

const instPrograms = (r: Row) => (r.prog ? [r.prog] : r.inst ? programsByInstitution(r.inst.id) : []);
const nextDate = (r: Row): number => {
  const dates: string[] = [];
  if (r.sch?.window.closes.value) dates.push(r.sch.window.closes.value);
  const modes = r.mode ? [r.mode] : r.inst ? modesByInstitution(r.inst.id) : [];
  modes.forEach((m) => m.next_dates.value?.forEach((d) => dates.push(d.date)));
  const future = dates.map((d) => daysUntil(d)).filter((d) => d >= 0);
  return future.length ? Math.min(...future) : 99999;
};
const hasScholarship = (r: Row) => {
  const country = r.inst?.country;
  const levels = r.prog ? [r.prog.level] : instPrograms(r).map((p) => p.level);
  return scholarships.some(
    (s) => s.status !== 'cerrada' && s.status !== 'suspendida' &&
      (s.kind === 'institucional' ? s.institution_id === r.inst?.id : s.study_country === country) &&
      s.levels.some((l) => levels.includes(l)),
  );
};

const FILTERS: FilterDef[] = [
  { key: 'pais', label: 'País', options: [{ value: 'PE', label: 'Perú' }, { value: 'US', label: 'EE. UU.' }], tabs: ['universidades', 'carreras', 'modalidades', 'becas'],
    test: (r, v) => (r.sch ? r.sch.study_country === v || r.sch.study_country === 'varios' : r.inst?.country === v), sort: (r) => r.inst?.country ?? r.sch?.study_country ?? '' },
  { key: 'ciudad', label: 'Ciudad', options: cities.map((c) => ({ value: c, label: c })), tabs: ['universidades', 'carreras', 'modalidades'],
    test: (r, v) => r.inst?.city === v, sort: (r) => r.inst?.city ?? '' },
  { key: 'gestion', label: 'Tipo de gestión', options: [{ value: 'publica', label: 'Pública' }, { value: 'privada', label: 'Privada' }], tabs: ['universidades', 'carreras', 'modalidades'],
    test: (r, v) => r.inst?.management === v, sort: (r) => r.inst?.management ?? '' },
  { key: 'area', label: 'Área', options: areas.map((a) => ({ value: a, label: a })), tabs: ['universidades', 'carreras'],
    test: (r, v) => instPrograms(r).some((p) => p.area === v), sort: (r) => r.prog?.area ?? '' },
  { key: 'carrera', label: 'Carrera', text: true, tabs: ['universidades', 'carreras'],
    test: (r, v) => instPrograms(r).some((p) => `${p.name} ${p.career_paths.join(' ')}`.toLowerCase().includes(v.toLowerCase())), sort: (r) => r.prog?.name ?? r.inst?.name ?? '' },
  { key: 'nivel', label: 'Nivel', options: [{ value: 'pregrado', label: 'Pregrado' }, { value: 'posgrado', label: 'Posgrado' }], tabs: ['universidades', 'carreras', 'becas'],
    test: (r, v) => (r.sch ? r.sch.levels.includes(v as 'pregrado') : instPrograms(r).some((p) => p.level === v)), sort: (r) => r.prog?.level ?? '' },
  { key: 'modalidad', label: 'Modalidad de ingreso', options: [{ value: 'escolar', label: 'Para escolares de 5.º' }, { value: 'egresado', label: 'Para egresados' }, { value: 'early', label: 'Early Action / Decision' }], tabs: ['universidades', 'carreras', 'modalidades'],
    test: (r, v) => {
      const modes = r.mode ? [r.mode] : r.inst ? modesByInstitution(r.inst.id) : [];
      return modes.some((m) => (v === 'escolar' ? /5\.º/.test(m.for_whom) : v === 'egresado' ? /egresad/i.test(m.for_whom) : /early/i.test(m.name)));
    } },
  { key: 'idioma', label: 'Idioma requerido', options: [{ value: 'es', label: 'Español' }, { value: 'en', label: 'Inglés' }], tabs: ['universidades', 'carreras', 'idiomas'],
    test: (r, v) => (r.cred ? (v === 'en' ? r.cred.language === 'Inglés' : r.cred.language !== 'Inglés') : instPrograms(r).some((p) => p.language_of_instruction === v)) },
  { key: 'certificacion', label: 'Certificación aceptada', options: [{ value: 'toefl', label: 'TOEFL iBT' }, { value: 'ielts', label: 'IELTS' }, { value: 'duolingo', label: 'Duolingo' }, { value: 'cambridge', label: 'Cambridge' }], tabs: ['universidades', 'carreras'],
    test: (r, v) => !!r.inst?.english_tests?.value?.includes(v), sort: (r) => -(r.inst?.english_tests?.value?.length ?? 0) },
  { key: 'costo', label: 'Costo', options: [{ value: 'publicado', label: 'Con costo publicado' }, { value: 'pv', label: 'Costo por verificar' }], tabs: ['universidades', 'carreras'],
    test: (r, v) => (v === 'publicado' ? r.inst?.tuition.status === 'verificado' && !!r.inst.tuition.value : !r.inst?.tuition.value), sort: (r) => r.inst?.tuition.value?.min ?? 1e9 },
  { key: 'ayuda', label: 'Ayuda financiera', options: [{ value: 'si', label: 'Política de ayuda publicada' }], tabs: ['universidades', 'carreras'],
    test: (r) => r.inst?.intl_aid?.status === 'verificado' && !!r.inst.intl_aid.value, sort: (r) => (r.inst?.intl_aid?.status === 'verificado' ? 0 : 1) },
  { key: 'beca', label: 'Beca disponible', options: [{ value: 'si', label: 'Hay beca que podría aplicar' }], tabs: ['universidades', 'carreras'],
    test: (r) => hasScholarship(r), sort: (r) => (hasScholarship(r) ? 0 : 1) },
  { key: 'fecha', label: 'Fecha límite', options: [{ value: '14', label: 'En los próximos 14 días' }, { value: '45', label: 'En los próximos 45 días' }, { value: '120', label: 'En los próximos 4 meses' }], tabs: ['universidades', 'carreras', 'modalidades', 'becas'],
    test: (r, v) => nextDate(r) <= Number(v), sort: nextDate },
];
const FDEF = new Map(FILTERS.map((f) => [f.key, f]));

function rowsFor(tab: Tab): Row[] {
  switch (tab) {
    case 'universidades':
      return institutions.map((i) => ({ key: `institution:${i.id}`, kind: 'institution', inst: i }));
    case 'carreras':
      return programs.map((p) => ({ key: `program:${p.id}`, kind: 'program', prog: p, inst: institutionById.get(p.institution_id) }));
    case 'modalidades':
      return admissionModes.map((m) => ({ key: `mode:${m.id}`, kind: 'mode', mode: m, inst: institutionById.get(m.institution_id) }));
    case 'becas':
      return scholarships.map((s) => ({ key: `scholarship:${s.id}`, kind: 'scholarship', sch: s, inst: s.institution_id ? institutionById.get(s.institution_id) : undefined }));
    case 'idiomas':
      return credentials.map((c) => ({ key: `credential:${c.id}`, kind: 'credential', cred: c }));
  }
}

function applyFilters(rows: Row[], filters: ActiveFilter[], tab: Tab) {
  const active = filters.map((f) => ({ f, def: FDEF.get(f.key)! })).filter(({ def }) => def.tabs.includes(tab));
  const out = rows.filter((r) => active.every(({ f, def }) => !f.value || def.test(r, f.value)));
  // El orden de los filtros define el orden de los resultados.
  return out.sort((a, b) => {
    for (const { def } of active) {
      if (!def.sort) continue;
      const x = def.sort(a);
      const y = def.sort(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

/** Qué se agrega a la lista corta al soltar una tarjeta. */
function shortlistTarget(r: Row): { target: 'program' | 'institution' | 'scholarship'; id: string; name: string } | null {
  if (r.kind === 'program' && r.prog) return { target: 'program', id: r.prog.id, name: r.prog.name };
  if (r.kind === 'scholarship' && r.sch) return { target: 'scholarship', id: r.sch.id, name: r.sch.name };
  if (r.inst) return { target: 'institution', id: r.inst.id, name: r.inst.name };
  return null;
}

// ---------------- Página ----------------

// Con mouse o pantalla táctil: solo cuenta la zona bajo el puntero (así, soltar un filtro
// fuera de «Mis filtros» lo quita). Con teclado no hay puntero: se usa la zona más cercana.
const collision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return pointerWithin(args);
  return closestCenter(args);
};

export default function ExplorePage() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const students = useStore((s) => s.students);
  const add = useStore((s) => s.addToShortlist);
  const notify = useStore((s) => s.notify);
  const [tab, setTab] = useState<Tab>('universidades');
  const [mode, setMode] = useState<'cards' | 'table'>('cards');
  const [editing, setEditing] = useState<FilterKey | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useDndSensors();

  const rows = useMemo(() => rowsFor(tab), [tab]);
  const results = useMemo(() => applyFilters(rows, filters, tab), [rows, filters, tab]);
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const addFilter = (key: FilterKey, at?: number) => {
    if (filters.some((f) => f.key === key)) return;
    const next = [...filters];
    next.splice(at ?? next.length, 0, { key, value: '' });
    setFilters(next);
    setEditing(key);
  };
  const removeFilter = (key: FilterKey) => setFilters(filters.filter((f) => f.key !== key));

  const dropOnStudent = (r: Row, studentId: string) => {
    const t = shortlistTarget(r);
    const s = students.find((x) => x.id === studentId);
    if (!t || !s) return;
    if (add(studentId, { target: t.target, id: t.id })) notify(`${t.name} se agregó a la lista corta de ${s.alias}.`);
    else notify(`${t.name} ya estaba en la lista corta de ${s.alias}.`);
  };

  const name = (id: string | number) => {
    const s = String(id);
    if (s.startsWith('pal:') || s.startsWith('flt:')) return `el filtro ${FDEF.get(s.slice(4) as FilterKey)?.label}`;
    if (s === 'zone') return 'la zona Mis filtros';
    if (s.startsWith('stu:')) return students.find((x) => x.id === s.slice(4))?.alias ?? s;
    if (s.startsWith('res:')) {
      const r = rowByKey.get(s.slice(4));
      return r ? shortlistTarget(r)?.name ?? s : s;
    }
    return s;
  };

  const onStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (a.startsWith('pal:')) {
      if (o === 'zone') addFilter(a.slice(4) as FilterKey);
      else if (o?.startsWith('flt:')) addFilter(a.slice(4) as FilterKey, filters.findIndex((f) => f.key === o.slice(4)));
      return;
    }
    if (a.startsWith('flt:')) {
      const key = a.slice(4) as FilterKey;
      if (!o || (!o.startsWith('flt:') && o !== 'zone')) {
        removeFilter(key);
        notify(`Quitaste el filtro ${FDEF.get(key)?.label}.`);
        return;
      }
      if (o.startsWith('flt:') && o !== a) {
        const from = filters.findIndex((f) => f.key === key);
        const to = filters.findIndex((f) => f.key === o.slice(4));
        setFilters(arrayMove(filters, from, to));
      }
      return;
    }
    if (a.startsWith('res:') && o?.startsWith('stu:')) {
      const r = rowByKey.get(a.slice(4));
      if (r) dropOnStudent(r, o.slice(4));
    }
  };

  const draggingRow = dragId?.startsWith('res:') ? rowByKey.get(dragId.slice(4)) : undefined;
  const draggingFilter = dragId && (dragId.startsWith('pal:') || dragId.startsWith('flt:')) ? FDEF.get(dragId.slice(4) as FilterKey) : undefined;

  return (
    <div className="fade-in">
      <PageHeader title="Explorar" subtitle="Universidades de Perú y EE. UU., carreras, ingreso, becas e idiomas en un solo catálogo." />
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onStart}
        onDragEnd={onEnd}
        onDragCancel={() => setDragId(null)}
        accessibility={{ announcements: announcements(name), screenReaderInstructions }}
      >
        <div className="grid grid-cols-[210px_minmax(0,1fr)_200px] gap-5">
          {/* Paleta */}
          <aside aria-labelledby="pal-title" className="card h-fit p-4">
            <h2 id="pal-title" className="mb-1 flex items-center gap-2 font-sans text-sm font-semibold">
              <FilterIcon size={15} aria-hidden /> Filtros
            </h2>
            <p className="mb-3 text-xs text-muted">Arrástralos a «Mis filtros».</p>
            <ul className="space-y-1.5">
              {FILTERS.map((f) => (
                <PaletteItem key={f.key} def={f} used={filters.some((x) => x.key === f.key)} onAdd={() => addFilter(f.key)} />
              ))}
            </ul>
          </aside>

          {/* Centro */}
          <div className="min-w-0 space-y-4">
            <FilterZone filters={filters} tab={tab} editing={editing} setEditing={setEditing} onRemove={removeFilter} onChange={(key, value) => setFilters(filters.map((f) => (f.key === key ? { ...f, value } : f)))} />
            <Views />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Catálogo" className="flex flex-wrap gap-1 rounded-xl bg-grey-soft p-1">
                {TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx('rounded-lg px-3 py-1.5 text-sm transition-colors duration-150', tab === t.id ? 'bg-paper font-semibold shadow-sm' : 'text-muted hover:text-navy')}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted" aria-live="polite">{results.length} resultados</span>
                <div className="flex rounded-lg border border-line bg-paper p-0.5">
                  <button aria-pressed={mode === 'cards'} aria-label="Ver en tarjetas" onClick={() => setMode('cards')} className={cx('rounded-md p-1.5', mode === 'cards' && 'bg-grey-soft')}><LayoutGrid size={16} aria-hidden /></button>
                  <button aria-pressed={mode === 'table'} aria-label="Ver en tabla" onClick={() => setMode('table')} className={cx('rounded-md p-1.5', mode === 'table' && 'bg-grey-soft')}><Rows3 size={16} aria-hidden /></button>
                </div>
              </div>
            </div>
            {results.length === 0 ? (
              <Empty>No hay resultados con esta combinación. Quita un filtro o cambia su valor.</Empty>
            ) : mode === 'cards' ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {results.map((r) => (
                  <ResultCard key={r.key} r={r} onAdd={(sid) => dropOnStudent(r, sid)} />
                ))}
              </div>
            ) : (
              <ResultTable rows={results} />
            )}
          </div>

          {/* Estudiantes */}
          <aside aria-labelledby="stu-title" className="h-fit space-y-2 xl:sticky xl:top-6">
            <div className="card p-4">
              <h2 id="stu-title" className="font-sans text-sm font-semibold">Estudiantes</h2>
              <p className="mb-3 text-xs text-muted">Suelta una tarjeta sobre un estudiante para sumarla a su lista corta.</p>
              <ul className="space-y-2">
                {students.map((s) => (
                  <StudentDrop key={s.id} id={s.id} alias={s.alias} count={s.shortlist.length} active={!!draggingRow} />
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <DragOverlay dropAnimation={{ duration: 160 }}>
          {draggingFilter ? (
            <div className="rounded-full border border-gold bg-gold-soft px-3 py-1.5 text-sm font-medium text-gold-ink shadow-[var(--shadow-lift)]">{draggingFilter.label}</div>
          ) : draggingRow ? (
            <div className="w-64 rotate-2 rounded-xl border border-gold bg-paper p-3 shadow-[var(--shadow-lift)]">
              <div className="text-sm font-semibold">{shortlistTarget(draggingRow)?.name}</div>
              <div className="text-xs text-muted">Suéltala sobre un estudiante</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PaletteItem({ def, used, onAdd }: { def: FilterDef; used: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pal:${def.key}`, disabled: used });
  return (
    <li className={cx('flex items-center gap-1 rounded-lg border text-sm transition-colors duration-150', used ? 'border-transparent bg-grey-soft text-muted' : 'border-line bg-paper hover:border-gold', isDragging && 'opacity-40')}>
      <span ref={setNodeRef} {...attributes} {...listeners} aria-label={`Arrastrar filtro ${def.label}`} className={cx('flex flex-1 touch-none items-center gap-1.5 px-2 py-1.5', !used && 'cursor-grab')}>
        <GripVertical size={14} className="text-muted" aria-hidden />
        {def.label}
      </span>
      {!used && (
        <button onClick={onAdd} aria-label={`Agregar filtro ${def.label}`} className="mr-1 rounded p-1 text-muted hover:bg-gold-soft hover:text-gold-ink">
          <Plus size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

function FilterZone({ filters, tab, editing, setEditing, onRemove, onChange }: {
  filters: ActiveFilter[]; tab: Tab; editing: FilterKey | null; setEditing: (k: FilterKey | null) => void;
  onRemove: (k: FilterKey) => void; onChange: (k: FilterKey, v: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'zone' });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="zone-title"
      className={cx('rounded-2xl border-2 border-dashed p-4 transition-colors duration-150', isOver ? 'border-gold bg-gold-soft' : 'border-line bg-paper')}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="zone-title" className="font-sans text-sm font-semibold">Mis filtros</h2>
        <span className="text-xs text-muted">El orden define el orden de los resultados. Arrastra un filtro fuera para quitarlo.</span>
      </div>
      {filters.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">Arrastra aquí tus filtros.</p>
      ) : (
        <SortableContext items={filters.map((f) => `flt:${f.key}`)} strategy={horizontalListSortingStrategy}>
          <ol className="flex flex-wrap gap-2">
            {filters.map((f, i) => (
              <FilterChip key={f.key} f={f} index={i} applies={FDEF.get(f.key)!.tabs.includes(tab)} editing={editing === f.key} onEdit={() => setEditing(editing === f.key ? null : f.key)} onRemove={() => onRemove(f.key)} onChange={(v) => onChange(f.key, v)} />
            ))}
          </ol>
        </SortableContext>
      )}
    </section>
  );
}

function FilterChip({ f, index, applies, editing, onEdit, onRemove, onChange }: {
  f: ActiveFilter; index: number; applies: boolean; editing: boolean; onEdit: () => void; onRemove: () => void; onChange: (v: string) => void;
}) {
  const def = FDEF.get(f.key)!;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `flt:${f.key}` });
  const valueLabel = def.options?.find((o) => o.value === f.value)?.label ?? f.value;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('relative', isDragging && 'z-20 opacity-60')}>
      <div className={cx('flex items-center rounded-full border text-sm', applies ? 'border-teal-ink/40 bg-teal-soft text-teal-ink' : 'border-line bg-grey-soft text-muted')}>
        <span {...attributes} {...listeners} aria-label={`Mover filtro ${def.label}`} className="flex cursor-grab touch-none items-center pl-2 pr-1 py-1.5">
          <GripVertical size={13} aria-hidden />
          <span className="ml-0.5 text-[11px] font-semibold tabular-nums">{index + 1}</span>
        </span>
        <button onClick={onEdit} aria-expanded={editing} className="py-1.5 pr-1 font-medium">
          {def.label}: <span className="font-normal">{f.value ? valueLabel : 'elige un valor'}</span>
          {!applies && <span className="ml-1 text-[11px]">(no aplica aquí)</span>}
        </button>
        <button onClick={onRemove} aria-label={`Quitar filtro ${def.label}`} className="mr-1 rounded-full p-1 hover:bg-paper/70">
          <X size={13} aria-hidden />
        </button>
      </div>
      {editing && (
        <div className="fade-in absolute left-0 top-full z-30 mt-2 w-60 rounded-xl border border-line bg-paper p-3 shadow-[var(--shadow-lift)]">
          <div className="mb-2 text-xs font-semibold text-muted">{def.label}</div>
          {def.text ? (
            <input autoFocus value={f.value} onChange={(e) => onChange(e.target.value)} placeholder="p. ej. Psicología" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm focus:border-gold focus:outline-none" />
          ) : (
            <div className="flex flex-col gap-1">
              {def.options!.map((o) => (
                <button key={o.value} onClick={() => { onChange(o.value); onEdit(); }} aria-pressed={f.value === o.value} className={cx('rounded-lg px-2 py-1.5 text-left text-sm', f.value === o.value ? 'bg-teal-soft font-semibold text-teal-ink' : 'hover:bg-grey-soft')}>
                  {o.label}
                </button>
              ))}
              <button onClick={() => { onChange(''); onEdit(); }} className="mt-1 rounded-lg px-2 py-1 text-left text-xs text-muted hover:bg-grey-soft">Solo ordenar (sin filtrar)</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Views() {
  const views = useStore((s) => s.views);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const saveView = useStore((s) => s.saveView);
  const deleteView = useStore((s) => s.deleteView);
  const notify = useStore((s) => s.notify);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Vistas</span>
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center rounded-full border border-line bg-paper text-sm">
          <button className="px-3 py-1 hover:text-teal-ink" onClick={() => { setFilters(v.filters.map((f) => ({ ...f }))); notify(`Vista «${v.name}» aplicada.`); }}>{v.name}</button>
          <button aria-label={`Eliminar vista ${v.name}`} className="mr-1 rounded-full p-0.5 text-muted hover:text-coral-ink" onClick={() => deleteView(v.id)}><X size={12} aria-hidden /></button>
        </span>
      ))}
      {naming ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveView(name.trim()); notify('Vista guardada.'); } setName(''); setNaming(false); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la vista" aria-label="Nombre de la vista" className="rounded-full border border-line bg-paper px-3 py-1 text-sm focus:border-gold focus:outline-none" />
          <Button type="submit" className="px-3 py-1 text-xs">Guardar</Button>
        </form>
      ) : (
        <button disabled={filters.length === 0} onClick={() => setNaming(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-sky hover:bg-sky-soft disabled:opacity-40">
          <BookmarkPlus size={14} aria-hidden /> Guardar vista
        </button>
      )}
    </div>
  );
}

function StudentDrop({ id, alias, count, active }: { id: string; alias: string; count: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stu:${id}` });
  return (
    <li ref={setNodeRef} className={cx('flex items-center gap-2 rounded-xl border-2 p-2 transition-all duration-150', isOver ? 'scale-[1.03] border-gold bg-gold-soft' : active ? 'border-dashed border-gold/60' : 'border-transparent')}>
      <Avatar alias={alias} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{alias}</div>
        <div className="text-[11px] text-muted">{count} en lista corta</div>
      </div>
    </li>
  );
}

// ---------------- Resultados ----------------

function rowMeta(r: Row) {
  const sourceId = r.prog?.source_id ?? r.sch?.source_id ?? r.cred?.source_id ?? r.mode?.key_requirements.source_id ?? (r.inst ? (r.inst.english_requirement?.status === 'verificado' ? r.inst.english_requirement.source_id : r.inst.tuition.source_id) : undefined);
  const src = sourceId ? sourceById.get(sourceId) : undefined;
  const status: 'verificado' | 'por_verificar' =
    r.kind === 'scholarship' ? (r.sch!.window.closes.status === 'verificado' && r.sch!.coverage.status === 'verificado' ? 'verificado' : 'por_verificar')
      : r.kind === 'mode' ? r.mode!.key_requirements.status
        : src?.status ?? 'por_verificar';
  return { sourceId, src, status };
}

function ResultCard({ r, onAdd }: { r: Row; onAdd: (studentId: string) => void }) {
  const draggable = r.kind !== 'credential';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `res:${r.key}`, disabled: !draggable });
  const students = useStore((s) => s.students);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const compare = useStore((s) => s.compare);
  const notify = useStore((s) => s.notify);
  const { sourceId, src, status } = rowMeta(r);
  const t = shortlistTarget(r);
  const inCompare = t && compare.some((c) => c.kind === t.target && c.id === t.id);

  let title = '', subtitle = '';
  let body: React.ReactNode = null;
  if (r.kind === 'institution' && r.inst) {
    title = r.inst.name;
    subtitle = `${r.inst.city}, ${r.inst.region} · ${r.inst.management === 'publica' ? 'Pública' : 'Privada'}`;
    const progs = programsByInstitution(r.inst.id);
    body = (
      <>
        <p className="text-xs text-muted">{progs.length} carreras en el catálogo: {progs.slice(0, 3).map((p) => p.name).join(', ')}{progs.length > 3 ? '…' : ''}</p>
        {r.inst.intl_aid?.value === 'need_blind' && r.inst.intl_aid.status === 'verificado' && <Badge tone="teal"><Tip text={GLOSSARY['need-blind']}>need-blind publicado</Tip></Badge>}
        {r.inst.country === 'US' && <p className="text-xs"><span className="font-medium">Costo:</span> {fmtTuition(r.inst.tuition.value)}</p>}
      </>
    );
  } else if (r.kind === 'program' && r.prog) {
    title = r.prog.name;
    subtitle = `${r.inst?.short_name} · ${r.prog.area} · ${r.prog.level === 'pregrado' ? 'Pregrado' : 'Posgrado'}`;
    body = <p className="text-xs text-muted">Salidas: {r.prog.career_paths.join(', ')} · Clases en {r.prog.language_of_instruction === 'es' ? 'español' : 'inglés'}</p>;
  } else if (r.kind === 'mode' && r.mode) {
    title = r.mode.name;
    subtitle = `${r.inst?.short_name} · ${r.mode.for_whom}`;
    body = (
      <>
        {r.mode.key_requirements.value ? <p className="text-xs text-muted">{r.mode.key_requirements.value.slice(0, 2).join(' · ')}</p> : <p className="text-xs italic text-muted">Requisitos: por verificar</p>}
        {r.mode.next_dates.value?.[0] && <p className="text-xs"><span className="font-medium">Próxima fecha:</span> {fmtDate(r.mode.next_dates.value[0].date)}</p>}
      </>
    );
  } else if (r.kind === 'scholarship' && r.sch) {
    title = r.sch.name;
    subtitle = r.sch.provider;
    body = (
      <>
        <p className="text-xs text-muted">{r.sch.coverage.value ?? 'Cobertura: por verificar'}</p>
        <p className="text-xs"><span className="font-medium">Cierre:</span> {fmtDate(r.sch.window.closes.value)}</p>
      </>
    );
  } else if (r.kind === 'credential' && r.cred) {
    title = r.cred.name;
    subtitle = `${r.cred.provider}${r.cred.language ? ` · ${r.cred.language}` : ''}`;
    const tip = GLOSSARY[r.cred.name];
    body = (
      <p className="text-xs text-muted">
        {tip ? <Tip text={tip}>Qué es</Tip> : null} Formato y vigencia: por verificar. El puntaje mínimo lo publica cada universidad en su ficha.
      </p>
    );
  }

  return (
    <article
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      aria-label={draggable ? `${title}. Arrastra sobre un estudiante para agregarla a su lista corta.` : title}
      className={cx('card flex touch-none flex-col gap-2 p-4 transition-all duration-150', draggable && 'cursor-grab hover:border-gold active:cursor-grabbing', isDragging && 'opacity-40')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-semibold leading-snug">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <CountryTag country={r.inst?.country ?? r.sch?.study_country ?? (r.cred ? 'varios' : undefined)} />
      </div>
      {body}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <VerifyBadge status={status} />
        {src?.checked_at && <span className="text-[11px] text-muted">Consultado: {fmtDate(src.checked_at)}</span>}
        {sourceId && <SourceLink id={sourceId} compact />}
      </div>
      {draggable && t && (
        <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <label className="sr-only" htmlFor={`add-${r.key}`}>Agregar a la lista corta de</label>
          <select
            id={`add-${r.key}`}
            value=""
            onChange={(e) => e.target.value && onAdd(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-cream px-2 py-1 text-xs"
          >
            <option value="">Agregar a lista corta de…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.alias}</option>)}
          </select>
          <button
            onClick={() => { toggleCompare({ kind: t.target, id: t.id }); notify(inCompare ? 'Quitado de Comparar.' : `${t.name} se agregó a Comparar.`); }}
            aria-pressed={!!inCompare}
            title="Comparar (hasta tres)"
            className={cx('rounded-lg border p-1.5', inCompare ? 'border-teal-ink bg-teal-soft text-teal-ink' : 'border-line text-muted hover:bg-grey-soft')}
          >
            <GitCompareArrows size={14} aria-hidden />
            <span className="sr-only">Comparar</span>
          </button>
        </div>
      )}
    </article>
  );
}

function ResultTable({ rows }: { rows: Row[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Nombre</th>
            <th className="px-4 py-3 font-semibold">País</th>
            <th className="px-4 py-3 font-semibold">Detalle</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 font-semibold">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { sourceId, src, status } = rowMeta(r);
            const name = r.prog?.name ?? r.mode?.name ?? r.sch?.name ?? r.cred?.name ?? r.inst?.name ?? '';
            const detail = r.kind === 'program' ? `${r.inst?.short_name} · ${r.prog!.area}` : r.kind === 'mode' ? `${r.inst?.short_name} · ${r.mode!.for_whom}` : r.kind === 'scholarship' ? `Cierre: ${fmtDate(r.sch!.window.closes.value)}` : r.kind === 'credential' ? r.cred!.provider : `${r.inst!.city} · ${r.inst!.management === 'publica' ? 'Pública' : 'Privada'}`;
            return (
              <tr key={r.key} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2.5 font-medium">{name}</td>
                <td className="px-4 py-2.5"><CountryTag country={r.inst?.country ?? r.sch?.study_country ?? 'varios'} /></td>
                <td className="px-4 py-2.5 text-muted">{detail}</td>
                <td className="px-4 py-2.5"><VerifyBadge status={status} /></td>
                <td className="px-4 py-2.5">{sourceId ? <SourceLink id={sourceId} compact /> : '—'}{src?.checked_at && <div className="text-[11px] text-muted">{fmtDate(src.checked_at)}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
