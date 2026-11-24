import type { PaletteState } from './palette-library';

export function createPaletteHistory() {
  const past: PaletteState[] = [];
  const future: PaletteState[] = [];

  return {
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    record(previous: PaletteState, next: PaletteState) {
      const { color } = previous;
      if (previous.mode === next.mode && color.h === next.color.h &&
          color.s === next.color.s && color.v === next.color.v) return;
      past.push(previous);
      if (past.length > 50) past.shift();
      future.length = 0;
    },
    undo(current: PaletteState) {
      const previous = past.pop();
      if (previous) future.push(current);
      return previous;
    },
    redo(current: PaletteState) {
      const next = future.pop();
      if (next) past.push(current);
      return next;
    },
  };
}
