const maxBytes = 20 * 1024 * 1024;
const maxPixels = 25_000_000;
const maxEdge = 8192;

type Dimensions = { width: number; height: number };
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

function checkDimensions({ width, height }: Dimensions) {
  if (width < 1 || height < 1) throw new Error('The image has invalid dimensions.');
  if (width > maxEdge || height > maxEdge || width * height > maxPixels) {
    throw new Error('Choose an image up to 25 megapixels and 8192 px on either side.');
  }
}

function pngDimensions(bytes: DataView): Dimensions | undefined {
  // The first chunk must be the 13-byte IHDR. Its dimensions govern PNG decoding.
  if (bytes.byteLength < 33 || bytes.getUint32(8) !== 13 || bytes.getUint32(12) !== 0x49484452) return;
  const dimensions = { width: bytes.getUint32(16), height: bytes.getUint32(20) };
  checkDimensions(dimensions);
  for (let offset = 33; offset + 12 <= bytes.byteLength;) {
    const length = bytes.getUint32(offset);
    const type = bytes.getUint32(offset + 4);
    const next = offset + 12 + length;
    if (next > bytes.byteLength || type === 0x49484452) return;
    if (type === 0x6163544c || type === 0x6663544c || type === 0x66644154) {
      throw new Error('Choose a still image. Animated PNG and WebP are not supported.');
    }
    if (type === 0x49454e44) return length === 0 ? dimensions : undefined;
    offset = next;
  }
}

function jpegDimensions(bytes: DataView): Dimensions | undefined {
  // Skip metadata by segment length, so embedded thumbnails are not mistaken for the main image.
  for (let offset = 2; offset + 3 < bytes.byteLength;) {
    if (bytes.getUint8(offset++) !== 0xff) return;
    while (offset < bytes.byteLength && bytes.getUint8(offset) === 0xff) offset++;
    if (offset + 2 >= bytes.byteLength) return;
    const marker = bytes.getUint8(offset++);
    if (marker < 0xc0 || (marker >= 0xd0 && marker <= 0xda)) return;
    const length = bytes.getUint16(offset);
    if (length < 2 || offset + length > bytes.byteLength) return;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (marker > 0xc2 || length < 8) return;
      return { width: bytes.getUint16(offset + 5), height: bytes.getUint16(offset + 3) };
    }
    offset += length;
  }
}

function webpDimensions(bytes: DataView): Dimensions | undefined {
  if (bytes.getUint32(4, true) + 8 !== bytes.byteLength) return;
  let canvas: Dimensions | undefined;
  let image: Dimensions | undefined;
  let offset = 12;
  for (; offset + 8 <= bytes.byteLength;) {
    const type = bytes.getUint32(offset);
    const length = bytes.getUint32(offset + 4, true);
    const data = offset + 8;
    offset = data + length + (length % 2);
    if (offset > bytes.byteLength) return;
    if (type === 0x414e494d || type === 0x414e4d46) {
      throw new Error('Choose a still image. Animated PNG and WebP are not supported.');
    }
    if (type === 0x56503858) { // VP8X
      if (canvas || length !== 10 || data !== 20) return;
      if (bytes.getUint8(data) & 2) throw new Error('Choose a still image. Animated PNG and WebP are not supported.');
      const dimension = (at: number) => 1 + bytes.getUint16(at, true) + bytes.getUint8(at + 2) * 65536;
      canvas = { width: dimension(data + 4), height: dimension(data + 7) };
      checkDimensions(canvas);
    } else if (type === 0x56503820) { // VP8 (lossy)
      if (image || length < 10 || (bytes.getUint8(data) & 1) ||
          bytes.getUint16(data + 3) !== 0x9d01 || bytes.getUint8(data + 5) !== 0x2a) return;
      image = { width: bytes.getUint16(data + 6, true) & 0x3fff, height: bytes.getUint16(data + 8, true) & 0x3fff };
    } else if (type === 0x5650384c) { // VP8L (lossless)
      if (image || length < 5 || bytes.getUint8(data) !== 0x2f) return;
      const flags = bytes.getUint32(data + 1, true);
      if (flags >>> 29) return;
      image = { width: (flags & 0x3fff) + 1, height: ((flags >>> 14) & 0x3fff) + 1 };
    }
  }
  if (offset !== bytes.byteLength || !image) return;
  // Verify the bitstream dimensions even when an extended header declares a canvas.
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) return;
  return image;
}

/** Read only bounded, compressed input before handing bytes to the browser decoder. */
export async function prepareSampleImage(file: Blob) {
  if (file.size > maxBytes) throw new Error('Choose an image up to 20 MiB.');
  const bytes = new DataView(await file.arrayBuffer());
  let dimensions: Dimensions | undefined;
  let type: string;
  if (bytes.byteLength >= 8 && pngSignature.every((value, offset) => bytes.getUint8(offset) === value)) {
    type = 'image/png';
    dimensions = pngDimensions(bytes);
  } else if (bytes.byteLength >= 2 && bytes.getUint16(0) === 0xffd8) {
    type = 'image/jpeg';
    dimensions = jpegDimensions(bytes);
  } else if (bytes.byteLength >= 12 && bytes.getUint32(0) === 0x52494646 && bytes.getUint32(8) === 0x57454250) {
    type = 'image/webp';
    dimensions = webpDimensions(bytes);
  } else {
    throw new Error('Choose a still PNG, JPEG, or WebP image.');
  }
  if (!dimensions) throw new Error('Could not read the image header. Choose a valid PNG, JPEG, or WebP.');
  checkDimensions(dimensions);
  return new Blob([bytes.buffer], { type });
}
