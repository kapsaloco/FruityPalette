import { isTauri } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { Mode } from './color';

export async function copyText(value: string) {
  if (isTauri()) await writeText(value);
  else await navigator.clipboard.writeText(value);
}

export async function exportPalette(mode: Mode, swatches: { role: string; hex: string }[]) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 600;
  const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (!context) throw new Error('Could not create the PNG canvas.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, 1200, 600);
  context.fillStyle = '#17364B';
  context.font = 'bold 36px system-ui';
  context.fillText(mode + ' palette', 40, 75);
  const width = (1120 - 16 * (swatches.length - 1)) / swatches.length;
  swatches.forEach(({ role, hex }, i) => {
    const x = 40 + i * (width + 16);
    context.fillStyle = hex;
    context.fillRect(x, 110, width, 340);
    context.fillStyle = '#17364B';
    context.font = 'bold 24px system-ui';
    context.fillText(role, x, 487);
    context.font = '22px monospace';
    context.fillText(hex, x, 518);
  });
  context.font = '18px system-ui';
  context.fillText('Fruity Palette', 40, 570);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode the PNG.')), 'image/png');
  });
  const baseHex = swatches.find(swatch => swatch.role === 'Base')?.hex;
  const suffix = baseHex ? '-' + baseHex.slice(1) : '';
  const name = 'FruityPalette-' + mode.toLowerCase() + suffix + '.png';
  return saveFile(blob, name, 'PNG image', 'png');
}

export async function saveFile(blob: Blob, name: string, label: string, extension: 'png' | 'json') {
  if (!isTauri()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'download';
  }
  const path = await save({ defaultPath: name, filters: [{ name: label, extensions: [extension] }] });
  if (!path) return 'cancel';
  if (!path.toLowerCase().endsWith('.' + extension)) return 'extension';
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return 'saved';
}
