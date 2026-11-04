import { useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { sources } from '../lib/data';
import { fmtDate } from '../lib/format';
import { Badge, PageHeader, VerifyBadge, cx } from '../components/ui';

export default function SourcesPage() {
  const [only, setOnly] = useState<'todas' | 'verificado' | 'por_verificar'>('todas');
  const verified = sources.filter((s) => s.status === 'verificado').length;
  const list = sources.filter((s) => only === 'todas' || s.status === only);
  return (
    <div className="fade-in">
      <PageHeader title="Fuentes" subtitle="De dónde sale cada dato y cuándo se consultó. Una fuente con más de 90 días se marca «Revisar»." />
      <div className="mb-5 grid grid-cols-3 gap-4">
        <Stat label="Fuentes registradas" value={sources.length} />
        <Stat label="Verificadas" value={verified} tone="teal" />
        <Stat label="Por verificar" value={sources.length - verified} />
      </div>
      <div className="mb-3 flex gap-1 rounded-xl bg-grey-soft p-1 w-fit" role="group" aria-label="Filtrar fuentes">
        {(['todas', 'verificado', 'por_verificar'] as const).map((k) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)} className={cx('rounded-lg px-3 py-1.5 text-sm', only === k ? 'bg-paper font-semibold shadow-sm' : 'text-muted')}>
            {k === 'todas' ? 'Todas' : k === 'verificado' ? 'Verificadas' : 'Por verificar'}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Entidad</th>
              <th className="px-5 py-3 font-semibold">Documento o página</th>
              <th className="px-5 py-3 font-semibold">Consulta</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const old = s.checked_at ? differenceInCalendarDays(new Date(), parseISO(s.checked_at)) > 90 : false;
              return (
                <tr key={s.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium">{s.publisher}</td>
                  <td className="px-5 py-3">
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky underline decoration-sky/40 underline-offset-2 hover:decoration-sky">
                      {s.title} <ExternalLink size={12} aria-hidden />
                    </a>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{s.checked_at ? fmtDate(s.checked_at) : <span className="italic text-muted">Sin consultar</span>}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <VerifyBadge status={s.status} />
                      {old && <Badge tone="coral">Revisar</Badge>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-3xl text-sm text-muted">
        Método: solo fuentes oficiales (universidades, entidades que otorgan becas y organismos que toman exámenes). Las notas de prensa sirven como pista, no como fuente final. Si un dato no está publicado, queda vacío y se muestra «Por verificar».
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'teal' }) {
  return (
    <div className="card p-5">
      <div className={cx('font-display text-3xl font-semibold tabular-nums', tone === 'teal' && 'text-teal-ink')}>{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}
