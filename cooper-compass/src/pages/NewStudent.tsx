import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useStore } from '../store';
import type { Cefr, Country, Student } from '../types';
import { RIASEC_LABEL } from '../lib/matching';
import { stageLabel, budgetLabel, countryLabel } from '../lib/format';
import { Badge, Button, GLOSSARY, PageHeader, Tip, cx } from '../components/ui';
import { areas, credentials } from '../lib/data';

const STEPS = ['Datos básicos', 'Idiomas', 'Intereses', 'Fortalezas', 'Trabajo soñado', 'Propósito'];
const STRENGTHS = ['análisis', 'comunicación', 'liderazgo', 'creatividad', 'trabajo con personas', 'resolución de problemas', 'investigación', 'organización', 'matemática', 'programación'];
const CEFR: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const field = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm focus:border-gold focus:outline-none';

export default function NewStudentForm({ onDone }: { onDone: (id?: string) => void }) {
  const addStudent = useStore((s) => s.addStudent);
  const notify = useStore((s) => s.notify);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Student>({
    id: `stu-${Date.now()}`,
    alias: '',
    stage: 'escolar_5to',
    region: 'Lima',
    target_countries: ['PE'],
    budget_band: 'medio',
    english_cefr: 'B1',
    other_languages: [],
    credentials_held: [],
    riasec: { R: 5, I: 5, A: 5, S: 5, E: 5, C: 5 },
    strengths: [],
    dream_work: { text: '', sectors: [] },
    purpose: { ama: '', bueno: '', mundo: '', pagarian: '' },
    priorities: ['afinidad', 'interes', 'costo', 'idioma', 'ubicacion'],
    shortlist: [],
    pipeline: 'descubrimiento',
    notes: '',
    is_fictional: true,
  });
  const up = (patch: Partial<Student>) => setD((x) => ({ ...x, ...patch }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const canNext = step !== 0 || d.alias.trim().length > 1;

  const finish = () => {
    addStudent({ ...d, alias: d.alias.trim() });
    notify(`${d.alias.trim()} se agregó a Descubrimiento.`);
    onDone(d.id);
  };

  return (
    <div className="fade-in max-w-3xl">
      <button onClick={() => onDone()} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft size={16} aria-hidden /> Estudiantes
      </button>
      <PageHeader title="Nuevo estudiante" subtitle="Usa solo un alias. Para la demo, todos los perfiles son ficticios." />

      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Pasos">
        {STEPS.map((t, i) => (
          <li key={t}>
            <button
              onClick={() => (i <= step || canNext) && setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cx('flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium', i === step ? 'bg-navy text-cream' : i < step ? 'bg-teal-soft text-teal-ink' : 'bg-grey-soft text-muted')}
            >
              {i < step ? <Check size={12} aria-hidden /> : <span>{i + 1}</span>} {t}
            </button>
          </li>
        ))}
      </ol>

      <div className="card space-y-5 p-6">
        {step === 0 && (
          <>
            <L label="Alias (por ejemplo «Valeria R.»)">
              <input className={field} value={d.alias} onChange={(e) => up({ alias: e.target.value })} placeholder="Nombre y una inicial" autoFocus />
            </L>
            <div className="grid grid-cols-2 gap-4">
              <L label="Etapa">
                <select className={field} value={d.stage} onChange={(e) => up({ stage: e.target.value as Student['stage'] })}>
                  {Object.entries(stageLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </L>
              <L label="Región">
                <input className={field} value={d.region} onChange={(e) => up({ region: e.target.value })} />
              </L>
            </div>
            <L label="Países objetivo">
              <div className="flex gap-2">
                {(['PE', 'US', 'UK'] as Country[]).map((c) => (
                  <Chip key={c} on={d.target_countries.includes(c)} onClick={() => up({ target_countries: toggle(d.target_countries, c) })}>{countryLabel[c]}</Chip>
                ))}
              </div>
            </L>
            <L label="Presupuesto anual">
              <div className="flex flex-wrap gap-2">
                {Object.entries(budgetLabel).map(([k, v]) => (
                  <Chip key={k} on={d.budget_band === k} onClick={() => up({ budget_band: k as Student['budget_band'] })}>{v}</Chip>
                ))}
              </div>
            </L>
          </>
        )}
        {step === 1 && (
          <>
            <L label={<Tip text={GLOSSARY.MCER}>Nivel de inglés (MCER)</Tip>}>
              <div className="flex flex-wrap gap-2">
                {CEFR.map((c) => <Chip key={c} on={d.english_cefr === c} onClick={() => up({ english_cefr: c })}>{c}</Chip>)}
              </div>
            </L>
            <L label="Otro idioma (opcional)">
              <div className="grid grid-cols-2 gap-3">
                <input className={field} placeholder="Idioma, p. ej. Francés" value={d.other_languages[0]?.language ?? ''} onChange={(e) => up({ other_languages: e.target.value ? [{ language: e.target.value, cefr: d.other_languages[0]?.cefr ?? 'A1' }] : [] })} />
                <select className={field} value={d.other_languages[0]?.cefr ?? 'A1'} onChange={(e) => d.other_languages[0] && up({ other_languages: [{ ...d.other_languages[0], cefr: e.target.value }] })}>
                  {CEFR.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </L>
            <L label="Certificaciones que ya tiene">
              <div className="flex flex-wrap gap-2">
                {credentials.filter((c) => c.kind === 'idioma').map((c) => (
                  <Chip key={c.id} on={d.credentials_held.includes(c.id)} onClick={() => up({ credentials_held: toggle(d.credentials_held, c.id) })}>{c.name}</Chip>
                ))}
              </div>
            </L>
          </>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Puntaje de 0 a 10 en cada dimensión de <Tip text={GLOSSARY.RIASEC}>RIASEC</Tip></p>
            {(Object.keys(RIASEC_LABEL) as (keyof Student['riasec'])[]).map((k) => (
              <div key={k} className="grid grid-cols-[140px_1fr_32px] items-center gap-3">
                <label htmlFor={`r-${k}`} className="text-sm font-medium">{RIASEC_LABEL[k]}</label>
                <input id={`r-${k}`} type="range" min={0} max={10} value={d.riasec[k]} onChange={(e) => up({ riasec: { ...d.riasec, [k]: Number(e.target.value) } })} className="accent-[#1F6E66]" />
                <span className="text-right text-sm font-semibold tabular-nums">{d.riasec[k]}</span>
              </div>
            ))}
          </div>
        )}
        {step === 3 && (
          <L label="Fortalezas y competencias">
            <div className="flex flex-wrap gap-2">
              {STRENGTHS.map((t) => <Chip key={t} on={d.strengths.includes(t)} onClick={() => up({ strengths: toggle(d.strengths, t) })}>{t}</Chip>)}
            </div>
          </L>
        )}
        {step === 4 && (
          <>
            <L label="¿Cómo se imagina trabajando?">
              <textarea rows={3} className={field} value={d.dream_work.text} onChange={(e) => up({ dream_work: { ...d.dream_work, text: e.target.value } })} />
            </L>
            <L label="Sectores">
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => <Chip key={a} on={d.dream_work.sectors.includes(a)} onClick={() => up({ dream_work: { ...d.dream_work, sectors: toggle(d.dream_work.sectors, a) } })}>{a}</Chip>)}
              </div>
            </L>
          </>
        )}
        {step === 5 && (
          <div className="grid grid-cols-2 gap-4">
            {([['ama', 'Lo que ama'], ['bueno', 'En lo que es bueno'], ['mundo', 'Lo que el mundo necesita'], ['pagarian', 'Por lo que le pagarían']] as const).map(([k, t]) => (
              <L key={k} label={t}>
                <textarea rows={3} className={field} value={d.purpose[k]} onChange={(e) => up({ purpose: { ...d.purpose, [k]: e.target.value } })} />
              </L>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <Badge tone="gold">Perfil ficticio</Badge>
          <div className="flex gap-2">
            {step > 0 && <Button variant="soft" onClick={() => setStep(step - 1)}>Atrás</Button>}
            {step < STEPS.length - 1 ? (
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Siguiente</Button>
            ) : (
              <Button onClick={finish}>Guardar estudiante</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold">{label}</div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx('rounded-full border px-3 py-1.5 text-sm transition-colors duration-150', on ? 'border-teal-ink bg-teal-soft text-teal-ink font-medium' : 'border-line bg-paper hover:bg-grey-soft')}>
      {children}
    </button>
  );
}
