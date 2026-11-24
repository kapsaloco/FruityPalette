import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaletteHistory } from '../src/palette-history.ts';
import { encodeBackup, restoreBackup } from '../src/palette-library.ts';

const original = { name: 'Ocean', mode: 'Analogous', color: { h: 196.3, s: .72, v: .91 } };
const saved = { name: 'Dusk', mode: 'Triadic', color: { h: 282, s: .41, v: .62 } };

test('backup round-trips names, harmony modes, and HSV colors', () => {
  const palettes = [original, saved];
  assert.deepEqual(restoreBackup([], encodeBackup(palettes)), { palettes, added: 2 });
});

test('restore preserves local entries and skips exact duplicates in both libraries', () => {
  const sameName = { ...original, mode: 'Monochromatic' };
  const result = restoreBackup([original], encodeBackup([original, saved, saved, sameName]));
  assert.deepEqual(result, { palettes: [original, saved, sameName], added: 2 });
  assert.deepEqual(restoreBackup(result.palettes, encodeBackup(result.palettes)), {
    palettes: result.palettes, added: 0,
  });
});

test('malformed, unsupported, or partially invalid backups leave the library intact', () => {
  const existing = Object.freeze([original]);
  const wrongVersion = JSON.stringify({ ...JSON.parse(encodeBackup([saved])), version: 2 });
  const invalidColor = encodeBackup([saved, { ...original, color: { ...original.color, v: 2 } }]);
  for (const input of ['{', '{}', wrongVersion, invalidColor]) {
    assert.throws(() => restoreBackup(existing, input));
    assert.deepEqual(existing, [original]);
  }
});

test('undo and redo restore the full state after opening a saved palette', () => {
  const history = createPaletteHistory();
  const before = { color: original.color, mode: original.mode };
  const opened = { color: saved.color, mode: saved.mode };
  history.record(before, opened);
  assert.deepEqual(history.undo(opened), before);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(before), opened);
});

test('harmony-only changes are undoable and a new edit clears redo', () => {
  const history = createPaletteHistory();
  const before = { color: original.color, mode: original.mode };
  const opened = { ...before, mode: saved.mode };
  history.record(before, { ...before, color: { ...before.color } });
  assert.equal(history.canUndo, false);
  history.record(before, opened);
  assert.deepEqual(history.undo(opened), before);
  assert.deepEqual(history.redo(before), opened);
  history.undo(opened);
  history.record(before, { ...before, mode: 'Complementary' });
  assert.equal(history.canRedo, false);
});
