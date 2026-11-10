import { CalendarClock, Compass, GitCompareArrows, Home, Library, RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';
import { useStore, type Page } from './store';
import { Logo, Toast, cx } from './components/ui';
import HomePage from './pages/Home';
import StudentsPage from './pages/Students';
import ExplorePage from './pages/Explore';
import ScholarshipsPage from './pages/Scholarships';
import ComparePage from './pages/Compare';
import SourcesPage from './pages/Sources';
import Assistant from './components/Assistant';

const NAV: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'estudiantes', label: 'Estudiantes', icon: Users },
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'becas', label: 'Becas y fechas', icon: CalendarClock },
  { id: 'comparar', label: 'Comparar', icon: GitCompareArrows },
  { id: 'fuentes', label: 'Fuentes', icon: Library },
];

export default function App() {
  const page = useStore((s) => s.page);
  const go = useStore((s) => s.go);
  const reset = useStore((s) => s.reset);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-navy px-4 py-6 text-cream">
        <div className="mb-8 flex items-center gap-3 px-2 text-cream">
          <Logo size={40} />
          <div>
            <div className="font-display whitespace-nowrap text-lg font-semibold leading-tight">Cooper and Case</div>
            <div className="text-[11px] leading-tight text-cream/75">Cada estudiante, su propio norte.</div>
          </div>
        </div>
        <nav aria-label="Secciones" className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={page === id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-150',
                page === id ? 'bg-cream text-navy font-semibold' : 'text-cream/85 hover:bg-navy-2 hover:text-cream',
              )}
            >
              <Icon size={18} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          {confirming ? (
            <div className="rounded-xl bg-navy-2 p-3 text-xs">
              <p className="mb-2">¿Volver todo al estado inicial de la demo?</p>
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-gold px-2.5 py-1 font-semibold text-navy"
                  onClick={() => {
                    reset();
                    setConfirming(false);
                  }}
                >
                  Sí, restablecer
                </button>
                <button className="rounded-lg px-2.5 py-1 text-cream/85 hover:text-cream" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-cream/25 px-3 py-2 text-xs text-cream/85 transition-colors hover:bg-navy-2 hover:text-cream"
            >
              <RotateCcw size={14} aria-hidden /> Restablecer demo
            </button>
          )}
          <p className="text-[11px] leading-snug text-cream/65">Demo · Adria Labs · Datos de estudiantes 100 % ficticios.</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 pb-24 pt-8 xl:px-12">
        <div className="mx-auto max-w-[1500px]">
          {page === 'inicio' && <HomePage />}
          {page === 'estudiantes' && <StudentsPage />}
          {page === 'explorar' && <ExplorePage />}
          {page === 'becas' && <ScholarshipsPage />}
          {page === 'comparar' && <ComparePage />}
          {page === 'fuentes' && <SourcesPage />}
        </div>
      </main>

      <footer className="fixed bottom-0 left-60 right-0 z-30 border-t border-line bg-cream/95 px-8 py-2.5 text-center text-xs text-muted backdrop-blur">
        Información orientativa. Verifica siempre en la fuente oficial antes de asesorar.
      </footer>
      <Toast />
      <Assistant />
    </div>
  );
}
