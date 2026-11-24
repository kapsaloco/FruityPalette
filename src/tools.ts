import { invoke, isTauri } from '@tauri-apps/api/core';
import { contrastRatio, formatColor, fromRGB, parseHex, toRGB } from './color';
import type { Color, Mode, RGB } from './color';
import { saveFile } from './platform';
import { encodeBackup, isSaved, restoreBackup } from './palette-library';
import type { PaletteState, Saved } from './palette-library';
import { createPaletteHistory } from './palette-history';
import { prepareSampleImage } from './sample-image';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const key = 'fruity-palette.saved.v1';

function readSaved(): Saved[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(isSaved);
  } catch {
    return [];
  }
}

export function setupTools(
  current: () => PaletteState,
  choose: (color: Color, mode?: Mode) => void,
  announce: (message: string) => void,
) {
  const undo = element<HTMLButtonElement>('undo-color');
  const redo = element<HTMLButtonElement>('redo-color');
  const recent = element('recent-colors');
  let saved = readSaved();
  const deleteAll = element<HTMLButtonElement>('delete-all-palettes');
  const deleteDialog = element<HTMLDialogElement>('delete-palettes-dialog');
  const renameDialog = element<HTMLDialogElement>('rename-palette-dialog');
  const renameName = element<HTMLInputElement>('rename-palette-name');
  const backup = element<HTMLButtonElement>('backup-palettes');
  let renameIndex = -1;
  const history = createPaletteHistory();
  let visited: Color[] = [];
  const recentLimit = 14;
  let swatches: { role: string; color: Color }[] = [];
  const foreground = element<HTMLSelectElement>('contrast-text');
  const background = element<HTMLSelectElement>('contrast-background');

  function renderContrast() {
    const text = swatches[foreground.selectedIndex]?.color;
    const surface = swatches[background.selectedIndex]?.color;
    if (!text || !surface) return;
    const preview = element('contrast-preview');
    preview.style.color = formatColor(text, 'HEX');
    preview.style.backgroundColor = formatColor(surface, 'HEX');
    const ratio = contrastRatio(toRGB(text), toRGB(surface));
    const normal = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'below AA';
    const large = ratio >= 4.5 ? 'AAA' : ratio >= 3 ? 'AA' : 'below AA';
    element('contrast-ratio').textContent = ratio.toFixed(2) + ':1 contrast';
    element('contrast-normal').textContent = 'Normal text: ' + normal;
    element('contrast-large').textContent = 'Large text: ' + large;
  }

  foreground.addEventListener('change', renderContrast);
  background.addEventListener('change', renderContrast);
  element('contrast-swap').addEventListener('click', () => {
    [foreground.value, background.value] = [background.value, foreground.value];
    renderContrast();
  });
  undo.addEventListener('click', () => {
    const previous = history.undo(current());
    if (!previous) return;
    remember(current().color);
    choose(previous.color, previous.mode);
    if (undo.disabled) (redo.disabled ? element('hex') : redo).focus();
  });
  redo.addEventListener('click', () => {
    const next = history.redo(current());
    if (!next) return;
    remember(current().color);
    choose(next.color, next.mode);
    if (redo.disabled) undo.focus();
  });

  function renderSaved() {
    const list = element('saved-palettes');
    deleteAll.hidden = saved.length === 0;
    backup.disabled = saved.length === 0;
    element('saved-palettes-empty').hidden = saved.length > 0;
    list.replaceChildren(...saved.map((entry, index) => {
      const row = document.createElement('li');
      row.className = 'palette-tool-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'fr-button';
      open.classList.add('palette-saved-open');
      const swatch = document.createElement('span');
      swatch.className = 'fr-color-chip';
      swatch.style.backgroundColor = formatColor(entry.color, 'HEX');
      swatch.setAttribute('aria-hidden', 'true');
      open.append(swatch, entry.name);
      open.addEventListener('click', () => {
        record(current().color, entry.color, entry.mode);
        choose(entry.color, entry.mode);
        announce('Opened ' + entry.name + '.');
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fr-button fr-button--compact fr-button--danger-hover';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', 'Delete ' + entry.name);
      remove.addEventListener('click', () => {
        if (persist(saved.filter((_, i) => i !== index))) {
          element('palette-name').focus();
          announce('Deleted ' + entry.name + '.');
        }
      });
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'fr-button fr-button--compact';
      rename.textContent = 'Rename';
      rename.setAttribute('aria-label', 'Rename ' + entry.name);
      rename.addEventListener('click', () => {
        renameIndex = index;
        renameName.value = entry.name;
        renameName.setCustomValidity('');
        renameDialog.showModal();
        renameName.select();
      });
      row.append(open, rename, remove);
      return row;
    }));
  }

  function persist(next: Saved[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      saved = next;
      renderSaved();
      return true;
    } catch {
      announce('Could not update saved palettes. Local storage may be unavailable or full.');
      return false;
    }
  }

  const name = element<HTMLInputElement>('palette-name');
  renameName.addEventListener('input', () => renameName.setCustomValidity(''));
  element('cancel-rename-palette').addEventListener('click', () => renameDialog.close());
  element('rename-palette-form').addEventListener('submit', event => {
    event.preventDefault();
    const title = renameName.value.trim();
    if (!title) {
      renameName.setCustomValidity('Enter a palette name.');
      renameName.reportValidity();
      return;
    }
    if (persist(saved.map((entry, i) => i === renameIndex ? { ...entry, name: title } : entry))) {
      renameDialog.close();
      announce('Renamed palette to ' + title + '.');
    }
  });
  renameDialog.addEventListener('close', () => {
    element('saved-palettes').children[renameIndex]?.querySelectorAll('button')[1]?.focus();
  });
  backup.addEventListener('click', async () => {
    const blob = new Blob([encodeBackup(saved)], {
      type: 'application/json',
    });
    backup.disabled = true;
    try {
      const result = await saveFile(blob, 'FruityPalette-backup.json', 'JSON backup', 'json');
      if (result === 'saved') announce('Palette backup saved.');
      else if (result === 'download') announce('Palette backup download started.');
      else if (result === 'extension') announce('Choose a filename ending in .json.');
    } catch {
      announce('Could not save the palette backup.');
    } finally {
      backup.disabled = saved.length === 0;
    }
  });
  const restore = element<HTMLInputElement>('restore-palettes-file');
  element('restore-palettes').addEventListener('click', () => restore.click());
  restore.addEventListener('change', async () => {
    const file = restore.files?.[0];
    restore.value = '';
    if (!file) return;
    let restored: ReturnType<typeof restoreBackup>;
    try {
      if (file.size > 10_000_000) {
        announce('This backup exceeds the 10 MB import limit. No palettes were changed.');
        return;
      }
      const content = await file.text();
      restored = restoreBackup(saved, content);
    } catch {
      announce('Could not read this Fruity Palette JSON backup. No palettes were changed.');
      return;
    }
    if (!restored.added) announce('No new palettes to restore.');
    else if (persist(restored.palettes)) {
      announce('Restored ' + restored.added + (restored.added === 1 ? ' palette.' : ' palettes.'));
    }
  });
  deleteAll.addEventListener('click', () => {
    const count = saved.length;
    element('delete-palettes-description').textContent = count === 1
      ? 'This will permanently delete your saved palette.'
      : 'This will permanently delete all ' + count + ' saved palettes.';
    deleteDialog.returnValue = '';
    deleteDialog.showModal();
  });
  deleteDialog.addEventListener('close', () => {
    if (deleteDialog.returnValue === 'delete' && persist([])) {
      element('saved-palettes-summary').focus();
      announce('Deleted all saved palettes.');
    } else {
      deleteAll.focus();
    }
  });
  element('save-palette').addEventListener('submit', event => {
    event.preventDefault();
    const title = name.value.trim();
    if (!title) { announce('Enter a palette name.'); name.focus(); return; }
    if (persist([...saved, { ...current(), name: title }])) {
      name.value = '';
      announce('Saved ' + title + '.');
    }
  });
  renderSaved();

  function remember(color: Color) {
    const hex = formatColor(color, 'HEX');
    visited = [color, ...visited.filter(item => formatColor(item, 'HEX') !== hex)].slice(0, recentLimit + 1);
  }

  function record(before: Color, after: Color, afterMode = current().mode) {
    const previousMode = current().mode;
    const colorChanged = before.h !== after.h || before.s !== after.s || before.v !== after.v;
    if (colorChanged) remember(before);
    history.record({ color: before, mode: previousMode }, { color: after, mode: afterMode });
  }

  function refresh(next: typeof swatches) {
    undo.disabled = !history.canUndo;
    redo.disabled = !history.canRedo;
    const seen = new Set([formatColor(current().color, 'HEX')]);
    const buttons: HTMLButtonElement[] = [];
    for (const color of visited) {
      const label = formatColor(color, 'HEX');
      if (seen.has(label)) continue;
      seen.add(label);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fr-button fr-button--compact palette-recent';
      const chip = document.createElement('span');
      chip.className = 'fr-color-chip fr-color-chip--compact';
      chip.style.backgroundColor = label;
      chip.setAttribute('aria-hidden', 'true');
      button.append(chip, label);
      button.addEventListener('click', () => {
        record(current().color, color);
        choose(color);
        element('hex').focus();
      });
      buttons.push(button);
      if (buttons.length === recentLimit) break;
    }
    recent.replaceChildren(...(buttons.length ? buttons : ['No recent colors yet.']));

    const rolesChanged = next.map(s => s.role).join() !== swatches.map(s => s.role).join();
    swatches = next;
    {
      for (const [select, initial] of [[foreground, 0], [background, 1]] as const) {
        const previous = select.value;
        if (rolesChanged) select.replaceChildren(...swatches.map(({role}) => new Option(role, role)));
        swatches.forEach(({role, color}, index) => {
          select.options[index].textContent = role + ' · ' + formatColor(color, 'HEX');
        });
        if (swatches.some(s => s.role === previous)) select.value = previous;
        else select.selectedIndex = initial;
      }
    }
    renderContrast();
  }

  const sample = (rgb: RGB) => {
    const before = current().color;
    const next = fromRGB(rgb, before);
    record(before, next);
    choose(next);
    announce('Picked ' + formatColor(next, 'HEX') + '.');
  };
  setupSampling(sample, announce);
  return { record, refresh };
}

function setupSampling(sample: (rgb: RGB) => void, announce: (message: string) => void) {
  type Dropper = new () => { open(): Promise<{ sRGBHex: string }> };
  const dropper = (window as Window & { EyeDropper?: Dropper }).EyeDropper;
  const screen = element<HTMLButtonElement>('eyedropper');
  const imagePicker = element<HTMLDetailsElement>('image-picker');
  const file = element<HTMLInputElement>('sample-file');
  const cancel = element<HTMLButtonElement>('cancel-screen-pick');
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    try {
      await invoke('cancel_screen_pick');
    } catch {
      announce('Could not cancel. Press Esc to end screen picking.');
      cancel.disabled = false;
    }
  });
  const chooseImage = element<HTMLButtonElement>('choose-image');
  chooseImage.addEventListener('click', () => file.click());
  const native = isTauri() && /Windows/i.test(navigator.userAgent);
  window.addEventListener('keydown', event => {
    if (native && screen.disabled && [' ', 'Enter', 'Backspace', 'Escape'].includes(event.key)) {
      event.preventDefault();
    }
  }, { capture: true });
  if (!dropper && !native) screen.textContent = 'Pick from image';
  screen.addEventListener('click', async () => {
    if (!dropper && !native) { imagePicker.open = true; element('choose-image').focus(); return; }
    screen.disabled = true;
    try {
      const prompt = element('screen-pick-instructions');
      if (native) {
        prompt.hidden = false;
        document.body.classList.add('screen-sampling');
      }
      const hex = native ? await invoke<string | null>('pick_screen_color') : (await new dropper!().open()).sRGBHex;
      if (hex === 'timeout') announce('Screen picking timed out. Select Pick from screen to retry.');
      else if (native && hex === null) announce('Screen picking canceled.');
      const rgb = hex ? parseHex(hex) : null;
      if (rgb) sample(rgb);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        imagePicker.open = true;
        announce('Screen sampling is unavailable. You can pick from a local image.');
      }
    } finally {
      element('screen-pick-instructions').hidden = true;
      document.body.classList.remove('screen-sampling');
      cancel.disabled = false;
      screen.disabled = false;
      screen.focus();
    }
  });

  const canvas = element<HTMLCanvasElement>('sample-image');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const sampler = document.createElement('canvas');
  sampler.width = sampler.height = 1;
  const pixelContext = sampler.getContext('2d', { willReadFrequently: true });
  const position = element('sample-position');
  let source: HTMLImageElement | undefined;
  const imageError = element('sample-error');
  let loadingImage = false;
  let x = 0;
  let y = 0;

  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected || !context || loadingImage) return;
    loadingImage = true;
    chooseImage.disabled = true;
    imageError.textContent = '';
    let url: string | undefined;
    try {
      const verifiedImage = await prepareSampleImage(selected);
      canvas.hidden = true;
      canvas.width = canvas.height = 1;
      source = undefined;
      position.textContent = '';
      element('sample-filename').textContent = '';
      url = URL.createObjectURL(verifiedImage);
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      source = image;
      x = Math.floor(image.naturalWidth / 2);
      y = Math.floor(image.naturalHeight / 2);
      position.textContent = 'Pixel ' + x + ', ' + y;
      element('sample-filename').textContent = selected.name;
      canvas.hidden = false;
    } catch (error) {
      imageError.textContent = !url && error instanceof Error
        ? error.message
        : 'Could not open that image. Try another PNG, JPEG, or WebP.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      loadingImage = false;
      chooseImage.disabled = false;
    }
  });

  function pickPixel() {
    if (!source || !pixelContext) return;
    pixelContext.clearRect(0, 0, 1, 1);
    pixelContext.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
    const [r,g,b,a] = pixelContext.getImageData(0,0,1,1).data;
    if (a !== 255) { announce('Choose a fully opaque pixel.'); return; }
    sample([r,g,b]);
  }
  canvas.addEventListener('click', event => {
    if (!source) return;
    const rect = canvas.getBoundingClientRect();
    x = Math.max(0, Math.min(source.naturalWidth - 1, Math.floor((event.clientX - rect.left) * source.naturalWidth / rect.width)));
    y = Math.max(0, Math.min(source.naturalHeight - 1, Math.floor((event.clientY - rect.top) * source.naturalHeight / rect.height)));
    position.textContent = 'Pixel ' + x + ', ' + y;
    pickPixel();
  });
  canvas.addEventListener('keydown', event => {
    if (!source) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickPixel(); return; }
    const step = event.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step,0], ArrowRight: [step,0], ArrowUp: [0,-step], ArrowDown: [0,step] }[event.key];
    if (!Array.isArray(delta)) return;
    event.preventDefault();
    x = Math.max(0, Math.min(source.naturalWidth - 1, x + delta[0]));
    y = Math.max(0, Math.min(source.naturalHeight - 1, y + delta[1]));
    position.textContent = 'Pixel ' + x + ', ' + y;
  });
}






