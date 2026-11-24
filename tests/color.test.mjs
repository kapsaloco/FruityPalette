import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, formatColor, fromHSL, fromRGB, hue, palette, parseChannels, parseHex, toHSL, toRGB } from '../src/color.ts';

const previous = { h: 42, s: .75, v: .5 };

test('HEX and channel validation accept complete values only', () => {
  assert.deepEqual(parseHex(' #aBc '), [170,187,204]);
  for (const invalid of ['#', '#12', 'aabbccdd', '#GG0000']) assert.equal(parseHex(invalid), null);
  assert.deepEqual(parseChannels(['0','255','20'], 'rgb'), [0,255,20]);
  assert.ok(parseChannels(['256','-1','1.5'], 'rgb').every(Number.isNaN));
  assert.ok(parseChannels(['1e2','','12.'], 'hsl').every(Number.isNaN));
  assert.deepEqual(parseChannels(['-30.5','100','0'], 'hsl'), [-30.5,100,0]);
});

test('RGB and HSL round-trip across representative colors', () => {
  for (const rgb of [[255,0,0], [0,255,0], [0,0,255], [0,174,239], [1,0,1], [254,255,254], [127,127,127], [0,0,0], [255,255,255]]) {
    const hsv = fromRGB(rgb, previous);
    assert.deepEqual(toRGB(hsv), rgb);
    assert.deepEqual(toRGB(fromHSL(toHSL(hsv))), rgb);
  }
  const blue = fromRGB([0,174,239], previous);
  assert.equal(formatColor(blue, 'HEX'), '#00AEEF');
  assert.equal(formatColor(blue, 'RGB'), 'rgb(0, 174, 239)');
  assert.equal(formatColor(blue, 'HSL'), 'hsl(196.3, 100%, 46.9%)');
});

test('retains hue for gray and picker saturation for RGB black', () => {
  assert.equal(fromRGB([128,128,128], previous).h, 42);
  assert.deepEqual(fromRGB([0,0,0], previous), { ...previous, v: 0 });
  assert.deepEqual(fromHSL({h:-30,s:1,l:0}), {h:330,s:0,v:0});
  assert.deepEqual([360,-30,390].map(hue), [0,330,30]);
});

test('harmony wraps hue, preserves order and retains duplicate gray roles', () => {
  const base = fromHSL({h:350,s:.5,l:.4});
  assert.deepEqual(palette(base, 'Complementary').map(x => x.color.h), [350,170]);
  const analogous = palette(base, 'Analogous');
  assert.deepEqual(analogous.map(x => x.color.h), [320,350,20]);
  for (const { color } of analogous) {
    const {s,l} = toHSL(color);
    assert.ok(Math.abs(s-.5) < 1e-12);
    assert.ok(Math.abs(l-.4) < 1e-12);
  }
  const gray = palette(fromRGB([128,128,128], previous), 'Analogous');
  assert.deepEqual(gray.map(x => x.role), ['Left','Base','Right']);
  assert.deepEqual(gray.map(x => formatColor(x.color, 'HEX')), ['#808080','#808080','#808080']);
});


test('new harmonies produce the expected offsets and lightness steps', () => {
  const base = fromHSL({h:350,s:.5,l:.4});
  assert.deepEqual(palette(base, 'Triadic').map(x => x.color.h), [350,110,230]);
  assert.deepEqual(palette(base, 'Split-complementary').map(x => x.color.h), [350,140,200]);
  const mono = palette(base, 'Monochromatic').map(x => toHSL(x.color));
  assert.ok(mono.every(x => x.h === 350));
  assert.ok(mono[0].l < mono[1].l && mono[1].l < mono[2].l);
});

test('contrast uses linear sRGB luminance', () => {
  assert.equal(contrastRatio([255,255,255], [0,0,0]), 21);
  assert.equal(contrastRatio([10,10,10], [10,10,10]), 1);
  assert.ok(contrastRatio([118,118,118], [255,255,255]) >= 4.5);
  assert.ok(contrastRatio([119,119,119], [255,255,255]) < 4.5);
});
