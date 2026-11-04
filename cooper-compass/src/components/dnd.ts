import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type Announcements, type KeyboardCoordinateGetter, type ScreenReaderInstructions } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/** Mouse, pantalla táctil y teclado (espacio para tomar, flechas para mover, espacio para soltar, Esc para cancelar). */
export function useDndSensors(coordinateGetter: KeyboardCoordinateGetter = sortableKeyboardCoordinates) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );
}

/**
 * Teclado para tableros por columnas: ← y → saltan a la columna vecina cuyo id empieza con `prefix`.
 */
export function columnKeyboardCoordinates(prefix: string): KeyboardCoordinateGetter {
  return (event, { context: { droppableRects, collisionRect } }) => {
    if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined;
    event.preventDefault();
    if (!collisionRect) return undefined;
    const cols = [...droppableRects.entries()]
      .filter(([id]) => String(id).startsWith(prefix))
      .map(([, r]) => r)
      .sort((a, b) => a.left - b.left);
    const cx = collisionRect.left + collisionRect.width / 2;
    let idx = cols.findIndex((r) => cx >= r.left && cx <= r.left + r.width);
    if (idx === -1) idx = 0;
    const next = cols[event.code === 'ArrowRight' ? Math.min(idx + 1, cols.length - 1) : Math.max(idx - 1, 0)];
    return { x: next.left + (next.width - collisionRect.width) / 2, y: next.top + 40 };
  };
}

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para tomar este elemento presiona espacio o Enter. Muévelo con las flechas. Presiona espacio o Enter de nuevo para soltarlo, o Escape para cancelar.',
};

export function announcements(name: (id: string | number) => string): Announcements {
  return {
    onDragStart: ({ active }) => `Tomaste ${name(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} está sobre ${name(over.id)}.` : `${name(active.id)} no está sobre una zona.`),
    onDragEnd: ({ active, over }) => (over ? `Soltaste ${name(active.id)} en ${name(over.id)}.` : `Soltaste ${name(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelaste el movimiento de ${name(active.id)}.`,
  };
}
