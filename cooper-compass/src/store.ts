import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { Pipeline, Priority, ShortlistItem, ShortlistStatus, Student } from './types';
import { studentsSeed } from './lib/data';

export type Page = 'inicio' | 'estudiantes' | 'explorar' | 'becas' | 'comparar' | 'fuentes';

export type FilterKey =
  | 'pais' | 'ciudad' | 'gestion' | 'area' | 'carrera' | 'nivel' | 'modalidad'
  | 'idioma' | 'certificacion' | 'costo' | 'ayuda' | 'beca' | 'fecha';

export interface ActiveFilter {
  key: FilterKey;
  value: string; // '' = sin configurar (no filtra, pero sí ordena)
}

export interface SavedView {
  id: string;
  name: string;
  filters: ActiveFilter[];
}

export interface CompareItem {
  kind: 'program' | 'institution' | 'scholarship';
  id: string;
}

interface State {
  page: Page;
  studentId: string | null; // ficha abierta
  students: Student[];
  filters: ActiveFilter[];
  views: SavedView[];
  compare: CompareItem[];
  compareStudentId: string;
  toast: { id: number; text: string } | null;

  go: (page: Page, studentId?: string | null) => void;
  setPipeline: (id: string, p: Pipeline) => void;
  setPriorities: (id: string, p: Priority[]) => void;
  setShortlist: (id: string, list: ShortlistItem[]) => void;
  addToShortlist: (id: string, item: Omit<ShortlistItem, 'status'>) => boolean;
  removeFromShortlist: (id: string, index: number) => void;
  setShortlistStatus: (id: string, index: number, s: ShortlistStatus) => void;
  toggleCheck: (id: string, index: number, key: string) => void;
  setNotes: (id: string, notes: string) => void;
  addStudent: (s: Student) => void;
  setFilters: (f: ActiveFilter[]) => void;
  saveView: (name: string) => void;
  deleteView: (id: string) => void;
  toggleCompare: (c: CompareItem) => void;
  setCompareStudent: (id: string) => void;
  notify: (text: string) => void;
  reset: () => void;
}

const seedViews: SavedView[] = [
  {
    id: 'view-ing-us-ayuda',
    name: 'Ingeniería en EE. UU. con ayuda financiera',
    filters: [
      { key: 'pais', value: 'US' },
      { key: 'area', value: 'Ingeniería' },
      { key: 'ayuda', value: 'si' },
    ],
  },
];

const initial = () => ({
  page: 'inicio' as Page,
  studentId: null,
  students: structuredClone(studentsSeed),
  filters: [] as ActiveFilter[],
  views: structuredClone(seedViews),
  compare: [
    { kind: 'program', id: 'mit-6-14' },
    { kind: 'program', id: 'purdue-ds' },
    { kind: 'program', id: 'asu-ds' },
  ] as CompareItem[],
  compareStudentId: 'stu-mateo',
  toast: null,
});

/** localStorage puede fallar (ventana privada, vista previa): nunca rompemos la app por eso. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento: la demo sigue en memoria */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};

const patchStudent = (students: Student[], id: string, fn: (s: Student) => Student) =>
  students.map((s) => (s.id === id ? fn(s) : s));

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial(),
      go: (page, studentId = null) => {
        set({ page, studentId });
        window.scrollTo?.({ top: 0 });
      },
      setPipeline: (id, p) => set((st) => ({ students: patchStudent(st.students, id, (s) => ({ ...s, pipeline: p })) })),
      setPriorities: (id, p) => set((st) => ({ students: patchStudent(st.students, id, (s) => ({ ...s, priorities: p })) })),
      setShortlist: (id, list) => set((st) => ({ students: patchStudent(st.students, id, (s) => ({ ...s, shortlist: list })) })),
      addToShortlist: (id, item) => {
        const s = get().students.find((x) => x.id === id);
        if (!s) return false;
        if (s.shortlist.some((x) => x.target === item.target && x.id === item.id)) return false;
        set((st) => ({
          students: patchStudent(st.students, id, (x) => ({ ...x, shortlist: [...x.shortlist, { ...item, status: 'explorando' }] })),
        }));
        return true;
      },
      removeFromShortlist: (id, index) =>
        set((st) => ({ students: patchStudent(st.students, id, (s) => ({ ...s, shortlist: s.shortlist.filter((_, i) => i !== index) })) })),
      setShortlistStatus: (id, index, status) =>
        set((st) => ({
          students: patchStudent(st.students, id, (s) => ({ ...s, shortlist: s.shortlist.map((x, i) => (i === index ? { ...x, status } : x)) })),
        })),
      toggleCheck: (id, index, key) =>
        set((st) => ({
          students: patchStudent(st.students, id, (s) => ({
            ...s,
            shortlist: s.shortlist.map((x, i) => (i === index ? { ...x, checks: { ...x.checks, [key]: !x.checks?.[key] } } : x)),
          })),
        })),
      setNotes: (id, notes) => set((st) => ({ students: patchStudent(st.students, id, (s) => ({ ...s, notes })) })),
      addStudent: (s) => set((st) => ({ students: [...st.students, s] })),
      setFilters: (filters) => set({ filters }),
      saveView: (name) =>
        set((st) => ({ views: [...st.views, { id: `view-${Date.now()}`, name, filters: st.filters.map((f) => ({ ...f })) }] })),
      deleteView: (id) => set((st) => ({ views: st.views.filter((v) => v.id !== id) })),
      toggleCompare: (c) =>
        set((st) => {
          const exists = st.compare.some((x) => x.kind === c.kind && x.id === c.id);
          if (exists) return { compare: st.compare.filter((x) => !(x.kind === c.kind && x.id === c.id)) };
          if (st.compare.length >= 3) return { compare: [...st.compare.slice(1), c] };
          return { compare: [...st.compare, c] };
        }),
      setCompareStudent: (id) => set({ compareStudentId: id }),
      notify: (text) => set({ toast: { id: Date.now(), text: text.replace(/\.\.(\s|$)/g, '.$1') } }),
      reset: () => {
        set({ ...initial(), toast: { id: Date.now(), text: 'Demo restablecida al estado inicial.' } });
      },
    }),
    {
      name: 'cooper-compass-demo-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        students: s.students,
        filters: s.filters,
        views: s.views,
        compare: s.compare,
        compareStudentId: s.compareStudentId,
      }),
    },
  ),
);

export const useStudent = (id: string | null) => useStore((s) => s.students.find((x) => x.id === id) ?? null);
