import type { Color, Mode } from './color';
const modes: Mode[] = ['Complementary', 'Analogous', 'Triadic', 'Split-complementary', 'Monochromatic'];
export type PaletteState = { color: Color; mode: Mode };
export type Saved = PaletteState & { name: string };

const backupFormat = 'fruity-palette-library';

export function isSaved(value: unknown): value is Saved {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Saved>;
  const color = item.color;
  return typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60 &&
    item.mode !== undefined && modes.includes(item.mode) && !!color &&
    Number.isFinite(color.h) && color.h >= 0 && color.h < 360 &&
    [color.s, color.v].every(n => Number.isFinite(n) && n >= 0 && n <= 1);
}

export function encodeBackup(palettes: readonly Saved[]) {
  return JSON.stringify({ format: backupFormat, version: 1, palettes }, null, 2);
}

export function restoreBackup(saved: readonly Saved[], content: string) {
  const archive = JSON.parse(content);
  if (archive?.format !== backupFormat || archive.version !== 1 ||
      !Array.isArray(archive.palettes) || !archive.palettes.every(isSaved)) {
    throw new Error('Invalid backup.');
  }
  const entries: Saved[] = archive.palettes;
  const identity = ({name, mode, color: {h, s, v}}: Saved) => JSON.stringify([name, mode, h, s, v]);
  const existing = new Set(saved.map(identity));
  const additions = entries.filter(entry => {
    const id = identity(entry);
    if (existing.has(id)) return false;
    existing.add(id);
    return true;
  }).map(({name, mode, color: {h, s, v}}) => ({name, mode, color: {h, s, v}}));
  return { palettes: [...saved, ...additions], added: additions.length };
}
