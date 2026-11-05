import { X } from 'lucide-react';
import { useStore } from '../store';
import { institutionById, modesByInstitution, programById, scholarshipById, targetLabel } from '../lib/data';
import { fmtDate, fmtTuition } from '../lib/format';
import { NO_ELIGIBILITY, CountryTag, Empty, PageHeader, ScoreBar, SourceLink, VerifyBadge, cx } from '../components/ui';
import { matchAny } from '../lib/matching';
import type { Fact } from '../types';
import type { CompareItem } from '../store';

function cell<T>(f: Fact<T> | undefined, render: (v: T) => string = (v) => String(v)) {
  if (!f || f.value == null) return <span className="italic text-muted">Por verificar</span>;
  return (
    <div>
      <div className="text-sm">{render(f.value)}</div>
      {f.note && <div className="mt-1 text-xs text-muted">{f.note}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <VerifyBadge status={f.status} />
        {f.source_id && <SourceLink id={f.source_id} compact />}
      </div>
    </div>
  );
}

function rowsFor(c: CompareItem) {
  if (c.kind === 'scholarship') {
    const s = scholarshipById.get(c.id)!;
    return {
      requisitos: cell(s.requirements, (v) => v.join(' · ')),
      idioma: cell(s.language_requirement),
      fechas: cell(s.window.closes, (v) => `Cierre: ${fmtDate(v)}`),
      costo: <span className="text-sm text-muted">No aplica (beca)</span>,
      ayudas: cell(s.coverage),
    };
  }
  const instId = c.kind === 'program' ? programById.get(c.id)?.institution_id : c.id;
  const i = instId ? institutionById.get(instId) : undefined;
  if (!i) return null;
  const modes = modesByInstitution(i.id);
  const dated = modes.find((m) => m.next_dates.value?.length);
  const reqMode = modes.find((m) => m.key_requirements.value?.length);
  return {
    requisitos: i.local_diploma?.value ? cell(i.local_diploma) : reqMode ? cell(reqMode.key_requirements, (v) => `${reqMode.name}: ${v.join(' · ')}`) : cell(undefined),
    idioma: i.country === 'PE' ? <span className="text-sm">Clases en español</span> : cell(i.english_requirement),
    fechas: dated ? cell(dated.next_dates, (v) => v.map((d) => `${d.label.replace(/^.*?: /, '')}: ${fmtDate(d.date)}`).join(' · ')) : cell(undefined),
    costo: cell(i.tuition, (v) => fmtTuition(v)),
    ayudas: cell(i.intl_aid, (v) => (v === 'need_blind' ? 'Admisión need-blind y ayuda según necesidad' : v === 'limitada' ? 'Apoyo según necesidad con cupos limitados' : v)),
  };
}

export default function ComparePage() {
  const compare = useStore((s) => s.compare);
  const toggle = useStore((s) => s.toggleCompare);
  const students = useStore((s) => s.students);
  const sid = useStore((s) => s.compareStudentId);
  const setSid = useStore((s) => s.setCompareStudent);
  const student = students.find((s) => s.id === sid) ?? students[0];

  const labels: [keyof NonNullable<ReturnType<typeof rowsFor>>, string][] = [
    ['requisitos', 'Requisitos publicados'],
    ['idioma', 'Idioma'],
    ['fechas', 'Fechas'],
    ['costo', 'Costo publicado'],
    ['ayudas', 'Ayudas'],
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title="Comparar"
        subtitle="Hasta tres opciones lado a lado. Agrégalas desde Explorar con el botón de comparar."
        right={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Coincidencia con</span>
            <select value={student?.id} onChange={(e) => setSid(e.target.value)} className="rounded-xl border border-line bg-paper px-3 py-2 text-sm">
              {students.map((s) => <option key={s.id} value={s.id}>{s.alias}</option>)}
            </select>
          </label>
        }
      />
      {compare.length === 0 ? (
        <Empty>Todavía no hay opciones para comparar. Agrégalas desde Explorar.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="w-48 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-muted">Opción</th>
                {compare.map((c) => {
                  const t = targetLabel(c.kind, c.id);
                  return (
                    <th key={`${c.kind}:${c.id}`} className="px-5 py-4 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-display text-lg font-semibold leading-snug">{t.title}</div>
                          <div className="mt-0.5 text-sm font-normal text-muted">{t.subtitle}</div>
                          <div className="mt-2"><CountryTag country={t.country} /></div>
                        </div>
                        <button onClick={() => toggle(c)} aria-label={`Quitar ${t.title} de la comparación`} className="rounded-lg p-1 text-muted hover:bg-grey-soft"><X size={16} aria-hidden /></button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {student && (
                <tr className="border-b border-line bg-teal-soft/40">
                  <th className="px-5 py-4 text-sm font-semibold">
                    Coincidencia con {student.alias}
                    <div className="mt-1 text-[11px] font-normal text-muted">{NO_ELIGIBILITY}</div>
                  </th>
                  {compare.map((c) => {
                    const m = matchAny(student, c.kind, c.id);
                    return (
                      <td key={c.id} className="px-5 py-4 align-top">
                        {m && <ScoreBar score={m.score} />}
                        {m && <p className="mt-1 text-xs text-muted">{m.reasons[0]}</p>}
                      </td>
                    );
                  })}
                </tr>
              )}
              {labels.map(([k, label], idx) => (
                <tr key={k} className={cx('border-b border-line/70 last:border-0', idx % 2 === 1 && 'bg-cream/50')}>
                  <th className="px-5 py-4 align-top text-sm font-semibold">{label}</th>
                  {compare.map((c) => <td key={c.id} className="px-5 py-4 align-top">{rowsFor(c)?.[k]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
