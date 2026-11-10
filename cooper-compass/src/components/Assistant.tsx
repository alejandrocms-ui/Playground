import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, Eraser, Gauge, Loader2, Sparkles, Square, X, Wrench } from 'lucide-react';
import { getSample, type Claude } from '../lib/claudeTypes';
import { buildTools, rules, type Proposal } from '../lib/assistantTools';
import { useStore } from '../store';
import { cx } from './ui';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  activity?: string[];
  proposals?: Proposal[];
  error?: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  '¿Qué fechas límite vienen en los próximos 14 días?',
  '¿Qué opciones encajan con Mateo Q. y qué falta revisar?',
  'Busca ingeniería en EE. UU. con ayuda financiera publicada',
  '¿Qué requisitos publica Fulbright y qué está por verificar?',
  'Agrega Purdue a la lista corta de Diego M.',
  'Escribe un resumen para la familia de Camila T.',
];

const ACTIVITY: Record<string, string> = {
  buscar_catalogo: 'Buscando en el catálogo',
  ver_detalle: 'Leyendo la ficha y sus fuentes',
  listar_estudiantes: 'Revisando estudiantes',
  ver_estudiante: 'Leyendo el perfil del estudiante',
  proximas_fechas: 'Revisando fechas',
  ir_a: 'Abriendo la pantalla',
  aplicar_filtros: 'Aplicando filtros en Explorar',
  proponer_lista_corta: 'Preparando una propuesta',
  proponer_etapa: 'Preparando una propuesta',
  proponer_nota: 'Preparando una propuesta',
  proponer_prioridades: 'Preparando una propuesta',
  proponer_estudiante: 'Preparando una propuesta',
};

const ERRORS: Record<string, string> = {
  not_granted: 'Para usar el asistente, permite que esta página use Claude.',
  sampling_disabled: 'Claude no está disponible para esta cuenta.',
  rate_limited: 'Demasiadas consultas seguidas. Espera un momento y vuelve a intentar.',
  session_expired: 'Tu sesión expiró. Vuelve a iniciar sesión en Claude.',
  refused: 'No puedo ayudar con esa solicitud. Prueba a reformularla.',
  prompt_too_large: 'La conversación es muy larga. Límpiala y vuelve a preguntar.',
  tools_unavailable: 'Esta vista no permite que el asistente consulte los datos.',
  empty_completion: 'No obtuve respuesta. Prueba a preguntarlo de otra forma.',
};

let nextId = 1;

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [deep, setDeep] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const notify = useStore((s) => s.notify);

  useEffect(() => {
    let alive = true;
    getSample().then(async (s) => {
      if (!alive) return;
      if (!s) return setAvailable(false);
      const lim = await s.limits().catch(() => null);
      if (alive) setAvailable(!!lim?.tools || lim === null);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const sample = await getSample();
    if (!sample) {
      setAvailable(false);
      return;
    }
    setInput('');
    const history = msgs.filter((m) => !m.error && m.content).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((ms) => [...ms, { id: nextId++, role: 'user', content: q }, { id: nextId++, role: 'assistant', content: '', activity: [], proposals: [], pending: true }]);
    setBusy(true);
    const c = new AbortController();
    ctl.current = c;

    const propose = (p: Omit<Proposal, 'id' | 'status'>) =>
      patchLast((m) => ({ ...m, proposals: [...(m.proposals ?? []), { ...p, id: `p${nextId++}`, status: 'pendiente' }] }));
    const tools: Claude.sample.SampleTool[] = buildTools(propose).map((t) => ({
      ...t,
      execute: (inp, ctx) => {
        patchLast((m) => ({ ...m, activity: [...(m.activity ?? []), ACTIVITY[t.name] ?? t.name] }));
        return t.execute(inp, ctx);
      },
    }));

    const turns: Claude.sample.SampleMessage[] = [{ role: 'user', content: rules() }, ...history, { role: 'user', content: q }];
    try {
      await sample(turns, {
        tools,
        signal: c.signal,
        modelTier: deep ? 'default' : 'quick',
        onText: ({ text: t }) => patchLast((m) => ({ ...m, content: t })),
      });
      patchLast((m) => ({ ...m, pending: false }));
    } catch (err) {
      const e = err as Claude.sample.SampleError;
      if (e.code === 'not_granted' || e.code === 'sampling_disabled' || e.code === 'tools_unavailable') setAvailable(false);
      patchLast((m) => ({ ...m, pending: false, content: e.text ?? m.content, error: e.code === 'cancelled' ? 'Detenido.' : ERRORS[e.code] ?? 'Hubo un problema de conexión. Puedes volver a intentarlo.' }));
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  }

  const decide = (msgId: number, pid: string, apply: boolean) => {
    const p = msgs.find((m) => m.id === msgId)?.proposals?.find((x) => x.id === pid);
    if (!p || p.status !== 'pendiente') return;
    if (apply) notify(`${p.apply()}.`);
    const status: Proposal['status'] = apply ? 'aplicada' : 'descartada';
    setMsgs((ms) => ms.map((m) => (m.id !== msgId ? m : { ...m, proposals: m.proposals?.map((x) => (x.id === pid ? { ...x, status } : x)) })));
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-14 right-6 z-40 flex items-center gap-2 rounded-full bg-navy py-3 pl-4 pr-5 text-sm font-semibold text-cream shadow-[var(--shadow-lift)] transition-transform duration-150 hover:-translate-y-0.5"
          aria-label="Abrir Brújula IA, el asistente (Ctrl+K)"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-navy">
            <Sparkles size={16} aria-hidden />
          </span>
          Brújula IA
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="Brújula IA, asistente conversacional"
          className="fade-in fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-full flex-col border-l border-line bg-paper shadow-[var(--shadow-lift)]"
        >
          <header className="flex items-center gap-3 bg-navy px-5 py-4 text-cream">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-navy">
              <Sparkles size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-semibold leading-tight">Brújula IA</div>
              <div className="text-[11px] text-cream/75">Busca, analiza y propone cambios. Tú decides.</div>
            </div>
            <button
              onClick={() => setDeep((v) => !v)}
              aria-pressed={deep}
              title={deep ? 'Análisis profundo: más lento y detallado' : 'Modo rápido: respuestas en segundos'}
              className={cx('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium', deep ? 'bg-gold text-navy' : 'bg-navy-2 text-cream/85 hover:text-cream')}
            >
              <Gauge size={13} aria-hidden /> {deep ? 'Profundo' : 'Rápido'}
            </button>
            <button onClick={() => { ctl.current?.abort(); setMsgs([]); }} aria-label="Limpiar conversación" title="Limpiar conversación" className="rounded-lg p-1.5 text-cream/85 hover:bg-navy-2 hover:text-cream">
              <Eraser size={16} aria-hidden />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="rounded-lg p-1.5 text-cream/85 hover:bg-navy-2 hover:text-cream">
              <X size={18} aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
            {available === false && (
              <div className="rounded-xl border border-line bg-gold-soft p-4 text-sm text-navy">
                <p className="font-semibold">El asistente funciona al abrir Cooper and Case desde Claude.</p>
                <p className="mt-1 text-muted">Usa tu propia cuenta de Claude, sin claves ni servidores. Si Claude te pidió permiso, acéptalo y vuelve a preguntar. El resto del dashboard funciona igual, incluso sin internet.</p>
              </div>
            )}
            {msgs.length === 0 && available !== false && (
              <div>
                <p className="text-sm text-muted">
                  Hola. Puedo buscar en el catálogo, revisar perfiles, explicar coincidencias, preparar textos y <span className="font-semibold text-navy">proponer cambios</span> que tú confirmas.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-cream px-3 py-2 text-left text-sm transition-colors duration-150 hover:border-gold hover:bg-gold-soft">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="ml-10 rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-sm text-cream">{m.content}</div>
              ) : (
                <div key={m.id} className="mr-4 space-y-2">
                  {!!m.activity?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set(m.activity)].map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 rounded-full bg-grey-soft px-2 py-0.5 text-[11px] text-muted">
                          <Wrench size={11} aria-hidden /> {a}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.pending && !m.content && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 size={15} className="animate-spin" aria-hidden /> Pensando…
                    </div>
                  )}
                  {m.content && <div className="rounded-2xl rounded-bl-sm bg-cream px-4 py-3 text-sm leading-relaxed text-navy"><RichText text={m.content} /></div>}
                  {m.proposals?.map((p) => (
                    <div key={p.id} className={cx('rounded-xl border p-3 text-sm', p.status === 'pendiente' ? 'border-gold bg-gold-soft' : p.status === 'aplicada' ? 'border-teal-ink/30 bg-teal-soft' : 'border-line bg-grey-soft')}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Propuesta</div>
                      <div className="mt-0.5 font-semibold">{p.title}</div>
                      {p.detail && <div className="mt-0.5 whitespace-pre-line text-xs text-muted">{p.detail}</div>}
                      {p.status === 'pendiente' ? (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => decide(m.id, p.id, true)} className="inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-cream hover:bg-navy-2">
                            <Check size={13} aria-hidden /> Aplicar
                          </button>
                          <button onClick={() => decide(m.id, p.id, false)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-paper">Descartar</button>
                        </div>
                      ) : (
                        <div className={cx('mt-1 text-xs font-semibold', p.status === 'aplicada' ? 'text-teal-ink' : 'text-muted')}>{p.status === 'aplicada' ? 'Aplicada' : 'Descartada'}</div>
                      )}
                    </div>
                  ))}
                  {m.error && <div className="text-xs text-coral-ink">{m.error}</div>}
                </div>
              ),
            )}
          </div>

          <form
            className="border-t border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-cream p-2 focus-within:border-gold">
              <label htmlFor="assistant-input" className="sr-only">Escribe tu pregunta</label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Pregunta o pide algo: «¿qué becas cierran este mes?»"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
              />
              {busy ? (
                <button type="button" onClick={() => ctl.current?.abort()} aria-label="Detener" className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-cream">
                  <Square size={14} aria-hidden />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} aria-label="Enviar" className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-navy disabled:opacity-40">
                  <ArrowUp size={16} aria-hidden />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">Orientativo. Los cambios solo se aplican cuando tú los confirmas.</p>
          </form>
        </aside>
      )}
    </>
  );
}

/** Markdown mínimo y seguro: **negritas**, viñetas «- » y saltos de línea. Sin HTML. */
function RichText({ text }: { text: string }) {
  const bold = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em>
          : <Fragment key={i}>{part}</Fragment>);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="my-1 list-disc space-y-1 pl-5">
          {bullets.map((b, i) => <li key={i}>{bold(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split('\n').forEach((line) => {
    const t = line.trim();
    const b = t.match(/^[-*•]\s+(.*)$/) ?? t.match(/^\d+[.)]\s+(.*)$/);
    if (b) bullets.push(b[1]);
    else {
      flush();
      if (t) blocks.push(<p key={`p${blocks.length}`} className="my-1">{bold(t.replace(/^#+\s*/, ''))}</p>);
    }
  });
  flush();
  return <>{blocks}</>;
}
