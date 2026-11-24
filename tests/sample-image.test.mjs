import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareSampleImage } from '../src/sample-image.ts';

// These are header fixtures for the preflight, not complete decodable images.
function png(width, height, animated = false) {
  const header = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.set([8, 2], 24);
  const end = Buffer.alloc(12);
  end.write('IEND', 4);
  if (!animated) return new Blob([header, end]);
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8, 0);
  animation.write('acTL', 4);
  return new Blob([header, animation, end]);
}

function jpeg(width, height) {
  const frame = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
  frame.writeUInt16BE(height, 13);
  frame.writeUInt16BE(width, 15);
  return new Blob([frame], { type: 'application/octet-stream' });
}

function webp(width, height, canvasWidth = width) {
  const image = Buffer.alloc(14);
  image.write('VP8L');
  image.writeUInt32LE(5, 4);
  image[8] = 0x2f;
  image.writeUInt32LE((width - 1) | ((height - 1) << 14), 9);
  const canvas = Buffer.alloc(18);
  canvas.write('VP8X');
  canvas.writeUInt32LE(10, 4);
  canvas.writeUIntLE(canvasWidth - 1, 12, 3);
  canvas.writeUIntLE(height - 1, 15, 3);
  const header = Buffer.alloc(12);
  header.write('RIFF');
  header.writeUInt32LE(4 + image.length + canvas.length, 4);
  header.write('WEBP', 8);
  return new Blob([header, canvas, image]);
}

test('recognizes supported formats by their bytes and passes a correctly typed copy', async () => {
  for (const [input, type] of [[png(10, 10), 'image/png'], [jpeg(10, 10), 'image/jpeg'], [webp(10, 10), 'image/webp']]) {
    const verified = await prepareSampleImage(input);
    assert.equal(verified.type, type);
    assert.deepEqual(await verified.arrayBuffer(), await input.arrayBuffer());
  }
});

test('rejects an over-budget file before reading it', async () => {
  const input = { size: 20 * 1024 * 1024 + 1, arrayBuffer: () => assert.fail('read an oversized file') };
  await assert.rejects(prepareSampleImage(input), /20 MiB/);
});

test('enforces the pixel budget in each supported format and rejects an extreme side length', async () => {
  for (const make of [png, jpeg, webp]) {
    await assert.doesNotReject(prepareSampleImage(make(5000, 5000)));
    await assert.rejects(prepareSampleImage(make(5001, 5000)), /25 megapixels/);
    await assert.rejects(prepareSampleImage(make(8193, 1)), /8192 px/);
  }
});

test('rejects malformed, unsupported, animated, and inconsistent headers', async () => {
  await assert.rejects(prepareSampleImage(png(0, 20)), /invalid dimensions/);
  await assert.rejects(prepareSampleImage(png(10, 10, true)), /Animated/);
  await assert.rejects(prepareSampleImage(jpeg(10, 10).slice(0, 18)), /image header/);
  await assert.rejects(prepareSampleImage(webp(20, 10, 10)), /image header/);
  await assert.rejects(prepareSampleImage(new Blob(['<svg/>'], { type: 'image/png' })), /still PNG/);
});
