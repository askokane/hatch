// Strips embedded metadata from uploaded images, server-side.
//
// WHY THIS IS A SERVER CONCERN
//
// A photo taken on a phone carries EXIF: GPS coordinates, capture timestamp,
// device make and model. HATCH stores upload bytes verbatim and serves them back
// verbatim, so without this every profile picture and post photo would disclose
// where it was taken to any signed-in member — on a network whose premise is
// strangers meeting to collaborate, and where the picture is on every screen.
//
// The client also downscales through a canvas before uploading, which discards
// metadata as a side effect of re-encoding. That is the bandwidth fix, and it is
// a courtesy — it can be skipped entirely by posting to the route directly, and
// it does not run at all if the browser refuses the canvas. This pass is the
// guard, and it is the reason the guarantee holds rather than usually holding.
//
// WHAT IT DOES NOT DO
//
// It is a metadata remover, not a re-encoder — there is no image decoder here and
// no dependency that provides one. Pixels are never touched, so it cannot resize,
// cannot recompress, and cannot defend against a malicious *decoder* exploit. It
// removes the segments and chunks that carry provenance, which is the disclosure
// problem actually at hand.
//
// Every parser below is bounds-checked and forward-only: a malformed file makes
// it bail and return the input unchanged rather than loop, over-read, or emit a
// corrupt image. Failing open on parse is deliberate — a file we cannot parse is
// a file whose metadata we also cannot locate, and refusing all such uploads
// would reject legitimate images to no benefit. The formats that actually carry
// GPS (JPEG, PNG, WebP) all parse trivially; if one of them does not parse, it is
// near-certainly not a real photo from a camera.

const JPEG_APP1 = 0xe1; // EXIF and XMP both live here
const JPEG_APP13 = 0xed; // Photoshop IRB, which carries IPTC
const JPEG_COM = 0xfe; // free-text comment
const JPEG_SOS = 0xda; // start of scan: entropy-coded data follows, copy verbatim

// PNG ancillary chunks that carry text or provenance. Deliberately NOT dropped:
// gAMA/cHRM/iCCP/sRGB (colour rendering — removing them shifts how the image
// looks), and every critical chunk.
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripJpeg(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not SOI

  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;

  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) return null; // desynchronised; refuse to guess
    const marker = buf[i + 1]!;

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }

    if (marker === JPEG_SOS) {
      // Everything from here to EOI is scan data. Copy the rest wholesale.
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }

    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null; // truncated or nonsense
    const end = i + 2 + len;

    const drop = marker === JPEG_APP1 || marker === JPEG_APP13 || marker === JPEG_COM;
    if (!drop) out.push(buf.subarray(i, end));
    i = end;
  }

  return Buffer.concat(out);
}

function stripPng(buf: Buffer): Buffer | null {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) return null;

  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;

  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    // 12 = length(4) + type(4) + crc(4). Guard against a length that would wrap
    // or run past the end.
    if (len > buf.length || i + 12 + len > buf.length) return null;
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;

    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;

    if (type === "IEND") break;
  }

  return Buffer.concat(out);
}

function stripWebp(buf: Buffer): Buffer | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 4).toString("latin1") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("latin1") !== "WEBP") return null;

  const out: Buffer[] = [];
  let i = 12;
  let vp8x: Buffer | null = null;

  while (i + 8 <= buf.length) {
    const fourcc = buf.subarray(i, i + 4).toString("latin1");
    const size = buf.readUInt32LE(i + 4);
    // RIFF chunks are padded to even length.
    const padded = size + (size % 2);
    if (i + 8 + padded > buf.length) return null;
    const end = i + 8 + padded;

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      i = end;
      continue;
    }

    const chunk = buf.subarray(i, end);
    if (fourcc === "VP8X") {
      // The VP8X flag byte advertises which optional chunks are present. Leaving
      // the EXIF/XMP bits set after removing the chunks yields a file that
      // decoders consider malformed, so clear them. Bit 3 = EXIF, bit 2 = XMP.
      vp8x = Buffer.from(chunk);
      if (vp8x.length > 8) vp8x[8] = vp8x[8]! & ~0b0000_1100;
      out.push(vp8x);
    } else {
      out.push(chunk);
    }
    i = end;
  }

  if (out.length === 0) return null;

  const body = Buffer.concat(out);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  // RIFF size counts everything after this field, i.e. "WEBP" + the chunks.
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

/**
 * Returns `bytes` with provenance metadata removed, or the original buffer when
 * the format is not one that carries it or the file does not parse.
 *
 * GIF is intentionally passed through: it has no EXIF container, and cameras do
 * not produce GIFs — the comment/application extensions it does have are written
 * by encoders, not by a device that knows where it is.
 */
// The `Buffer<ArrayBuffer>` annotations are load-bearing, not decoration: Prisma's
// `Bytes` field wants exactly that, while `Buffer.concat` is typed as the looser
// `Buffer<ArrayBufferLike>` (it could in principle be backed by a SharedArrayBuffer).
// Narrowing here rather than at each call site keeps the copy in one place.
export function stripImageMetadata(
  bytes: Buffer<ArrayBuffer>,
  mimeType: string
): Buffer<ArrayBuffer> {
  let stripped: Buffer | null = null;
  try {
    if (mimeType === "image/jpeg") stripped = stripJpeg(bytes);
    else if (mimeType === "image/png") stripped = stripPng(bytes);
    else if (mimeType === "image/webp") stripped = stripWebp(bytes);
  } catch {
    // A parser that threw on hostile input is a parser that found nothing it
    // understood. Same outcome as a clean bail.
    stripped = null;
  }

  // Never return something larger than we were given: that would mean the parser
  // misread the structure and duplicated a region.
  if (!stripped || stripped.length === 0 || stripped.length > bytes.length) return bytes;
  // Copies once, and only on the path that already rebuilt the file anyway.
  return Buffer.from(stripped);
}
