import { bindHueKeyboard, bindSaturationValue, paintSaturationValue } from './styles/fruity/v1.1/color-controls';
import { enhanceSelect } from './styles/fruity/v1.1/select';
import { decimal, displayHue, formatColor, fromHSL, fromRGB, palette, parseChannels, parseHex, toHSL, toRGB } from './color';
import type { Color, Format, Mode, RGB } from './color';
import { copyText, exportPalette } from './platform';
import { setupTools } from './tools';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const hex = byId<HTMLInputElement>('hex');
const rgbFields = ['red', 'green', 'blue'].map(byId<HTMLInputElement>);
const hslFields = ['hsl-hue', 'saturation', 'lightness'].map(byId<HTMLInputElement>);
const groups = { hex: [hex], rgb: rgbFields, hsl: hslFields };
type Group = keyof typeof groups;
const angle = byId<HTMLInputElement>('hue');
const area = byId('picker-area');
const preview = byId('selected-hex');
const harmony = byId<HTMLSelectElement>('harmony');
const syncHarmony = enhanceSelect(harmony);
enhanceSelect(byId<HTMLSelectElement>('palette-copy-format'));
const format = byId<HTMLSelectElement>('copy-format');
enhanceSelect(format);
const swatches = byId('swatches');
const status = byId('status');
let color = fromRGB([0,174,239], {h:0,s:0,v:0});
const drafts = new Set<Group>();
let frame = 0;
let dragStart: Color | undefined;
let hueStart: Color | undefined;
const recordedGroups = new Set<Group>();
const mode = () => harmony.value as Mode;
const tools = setupTools(() => ({ color, mode: mode() }), (next, selectedMode) => {
  if (selectedMode) harmony.value = selectedMode;
  pick(next);
}, message => { status.textContent = message; });

function fields(group: Group) {
  if (group === 'hex') return [formatColor(color, 'HEX')];
  if (group === 'rgb') return toRGB(color).map(String);
  const {h,s,l} = toHSL(color);
  return [displayHue(h), decimal(s*100), decimal(l*100)];
}

function render() {
  syncHarmony();
  for (const group of Object.keys(groups) as Group[]) {
    if (!drafts.has(group)) groups[group].forEach((input, i) => { input.value = fields(group)[i]; });
  }
  const label = formatColor(color, 'HEX');
  preview.textContent = label;
  preview.closest<HTMLElement>('.palette-preview')!.style.setProperty('--fr-swatch-color', label);
  angle.value = String(color.h);
  paintSaturationValue(area, color);
  byId('picker-value').textContent = 'Saturation ' + decimal(color.s*100) + '%, value ' + decimal(color.v*100) + '%';
  const colors = palette(color, mode());
  tools.refresh(colors);
  swatches.replaceChildren(...colors.map(({ role, color: swatch }) => {
    const card = byId<HTMLTemplateElement>('swatch-template').content.firstElementChild!.cloneNode(true) as HTMLElement;
    const label = formatColor(swatch, 'HEX');
    card.querySelector<HTMLElement>('.fr-color-swatch')!.style.backgroundColor = label;
    card.querySelector('.swatch-role')!.textContent = role + ' ';
    card.querySelector('strong')!.textContent = label;
    const button = card.querySelector('button')!;
    button.setAttribute('aria-label', 'Copy ' + role.toLowerCase() + ' color');
    button.addEventListener('click', () => void copy(swatch, button));
    return card;
  }));
}

function feedback(group: Group, errors: boolean[], commit: boolean) {
  const invalid = errors.some(Boolean);
  const message = group === 'hex' ? 'Enter 3 or 6 hexadecimal digits.' :
    group === 'rgb' ? 'Enter whole numbers from 0 to 255.' :
    'Enter a decimal hue and saturation and lightness from 0 to 100.';
  byId(group + '-error').textContent = invalid ? message : '';
  groups[group].forEach((input,i) => {
    if (errors[i] && commit) input.setAttribute('aria-invalid','true');
    else if (!errors[i]) input.removeAttribute('aria-invalid');
  });
}

function edit(group: Group, commit = false) {
  if (commit && !drafts.has(group)) return;
  const inputs = groups[group];
  const values = inputs.map(input => input.value);
  const parsed = group === 'hex' ? parseHex(values[0]) : parseChannels(values, group);
  const errors = parsed ? parsed.map(Number.isNaN) : [true];
  feedback(group, errors, commit);
  if (!parsed || errors.some(Boolean)) {
    drafts.add(group);
    return;
  }
  if (commit) {
    drafts.delete(group);
    recordedGroups.delete(group);
    const normalized = fields(group);
    inputs.forEach((input, i) => { input.value = normalized[i]; });
    return;
  }
  const previous = color;
  color = group === 'hsl'
    ? fromHSL({ h: parsed[0], s: parsed[1]/100, l: parsed[2]/100 })
    : fromRGB(parsed as RGB, color);

  if (!recordedGroups.has(group) && colorDiffers(previous, color)) {
    tools.record(previous, color);
    recordedGroups.add(group);
  }
  drafts.add(group);
  render();
}

for (const group of Object.keys(groups) as Group[]) {
  groups[group].forEach(input => {
    input.addEventListener('input', () => edit(group));
    input.addEventListener('focusout', event => {
      if (!groups[group].some(field => field === event.relatedTarget)) {
        edit(group, true);
        recordedGroups.delete(group);
      }
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); edit(group, true); }
      if (event.key === 'Escape' && drafts.has(group)) {
        event.preventDefault();
        drafts.delete(group);
        recordedGroups.delete(group);
        feedback(group, [], false);
        render();
      }
    });
  });
}

function colorDiffers(a: Color, b: Color) {
  return a.h !== b.h || a.s !== b.s || a.v !== b.v;
}

function pick(next: Color, defer = false) {
  color = next;
  for (const group of drafts) feedback(group, [], false);
  drafts.clear();
  recordedGroups.clear();
  if (defer) {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  } else render();
}

bindSaturationValue(area, {
  read: () => color,
  start: () => { dragStart = color; },
  change: (value, pointer) => {
    const next = { ...color, ...value };
    if (!pointer) tools.record(color, next);
    pick(next, pointer);
  },
  end: () => {
    if (dragStart) tools.record(dragStart, color);
    dragStart = undefined;
    if (!frame) render();
  },
});

angle.addEventListener('pointerdown', () => { hueStart = color; });
function finishHue() {
  if (!hueStart) return;
  tools.record(hueStart, color);
  hueStart = undefined;
  render();
}
window.addEventListener('pointerup', finishHue);
window.addEventListener('pointercancel', finishHue);
angle.addEventListener('input', () => {
  const next = { ...color, h: Number(angle.value) };
  if (!hueStart) tools.record(color, next);
  pick(next);
});
bindHueKeyboard(angle, () => color.h, h => {
  const next = { ...color, h };
  tools.record(color, next);
  pick(next);
});
harmony.addEventListener('change', render);

function draftNote() {
  return ['hex','rgb','hsl'].some(group => byId(group + '-error').textContent) ? ' Used the last valid color.' : '';
}

async function copy(value: Color, button: HTMLButtonElement) {
  await copyValue(formatColor(value, format.value as Format), button);
}

async function copyValue(text: string, button: HTMLButtonElement, paletteCopy = false) {
  const note = draftNote();
  const original = button.dataset.original ?? button.textContent!;
  button.dataset.original = original;
  button.disabled = true;
  try {
    await copyText(text);
    button.textContent = 'Copied';
    status.textContent = (paletteCopy ? 'Copied palette.' : 'Copied ' + text + '.') + note;
    byId('copy-fallback').hidden = true;
    setTimeout(() => { if (!button.disabled) button.textContent = original; }, 1500);
  } catch {
    button.textContent = original;
    status.textContent = 'Could not copy. Select the value shown to copy it manually.' + note;
    const fallback = byId<HTMLTextAreaElement>('copy-fallback');
    fallback.value = text;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
  } finally {
    button.disabled = false;
  }
}

byId('copy-color').addEventListener('click', () => void copy(color, byId('copy-color')));
const copyPalette = byId<HTMLButtonElement>('copy-palette');
copyPalette.addEventListener('click', () => {
  const hexes = palette(color, mode()).map(swatch => formatColor(swatch.color, 'HEX'));
  const css = byId<HTMLSelectElement>('palette-copy-format').value === 'css';
  const text = css ? [':root {', ...hexes.map((hex, i) => '  --palette-' + (i + 1) + ': ' + hex + ';'), '}'].join('\n') : hexes.join('\n');
  void copyValue(text, copyPalette, true);
});
const exportButton = byId<HTMLButtonElement>('export-png');
exportButton.addEventListener('click', async () => {
  const mode = harmony.value as Mode;
  const snapshot = palette(color, mode).map(({role,color}) => ({role,hex:formatColor(color,'HEX')}));
  const note = draftNote();
  const previous = status.textContent;
  exportButton.disabled = true;
  status.textContent = 'Preparing PNG…' + note;
  try {
    const result = await exportPalette(mode, snapshot);
    if (result === 'cancel') {
      if (status.textContent === 'Preparing PNG…' + note) status.textContent = previous;
    } else {
      status.textContent = (result === 'saved' ? 'Palette saved.' :
        result === 'download' ? 'PNG download started.' : 'Export again and choose a filename ending in .png.') + note;
    }
  } catch {
    status.textContent = 'Could not export the PNG. Check the destination and try again.';
  } finally {
    exportButton.disabled = false;
  }
});

render();








