import { test, expect } from "@playwright/test";
import { stripImageMetadata } from "../src/lib/image-metadata";

// Scenario 13: the EXIF stripper, at the unit level.
//
// This is not a browser test and deliberately does not take a `page` — it runs
// in the same suite because this repo has one test runner, and a byte-level
// parser that ships untested is how every upload gets quietly corrupted.
//
// The strongest assertions below are the byte-for-byte ones: a file with
// metadata spliced in, stripped, must equal the clean file exactly. That catches
// a parser that removes the right segment but drops a byte somewhere else, which
// no "does it still contain GPS" check ever would.

function expectTrue(name: string, cond: boolean, detail = "") {
  expect(cond, `${name}${detail ? ` — ${detail}` : ""}`).toBe(true);
}

const buf = (...parts: (Buffer | number[])[]) =>
  Buffer.from(Buffer.concat(parts.map((p) => (Array.isArray(p) ? Buffer.from(p) : p))));

test("strips metadata without corrupting the image", () => {

  // ---------- PNG ----------
  const REAL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  function crc32(b: Buffer): number {
    let c = ~0;
    for (const byte of b) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  function pngChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  }

  // Splice a tEXt and an eXIf chunk in after IHDR (which ends at byte 8+25=33).
  const withText = buf(
    REAL_PNG.subarray(0, 33),
    pngChunk("tEXt", Buffer.from("Comment\0secret location", "latin1")),
    pngChunk("eXIf", Buffer.from("II*\0\x08\0\0\0", "latin1")),
    REAL_PNG.subarray(33)
  );
  expectTrue("png: fixture is larger than the original", withText.length > REAL_PNG.length);
  const pngOut = stripImageMetadata(withText, "image/png");
  expectTrue("png: metadata chunks removed, bytes identical to the clean original",
    pngOut.equals(REAL_PNG), `${withText.length} -> ${pngOut.length} (want ${REAL_PNG.length})`);
  expectTrue("png: a clean file is passed through untouched",
    stripImageMetadata(REAL_PNG, "image/png").equals(REAL_PNG));
  expectTrue("png: truncated garbage returns input unchanged",
    stripImageMetadata(buf(REAL_PNG.subarray(0, 20)), "image/png").length === 20);

  // ---------- JPEG ----------
  // Structurally valid marker sequence: SOI, APP0(JFIF), APP1(Exif+GPS), DQT,
  // SOS + scan data, EOI. Only the APP1 should disappear.
  const seg = (marker: number, payload: Buffer) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
  };
  const exifPayload = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    Buffer.from("II*\0\x08\0\0\0GPSLatitude 51.5074 GPSLongitude -0.1278", "latin1"),
  ]);
  const jpegClean = buf(
    [0xff, 0xd8],
    seg(0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xdb, Buffer.alloc(65, 7)),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    [0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]
  );
  const jpegDirty = buf(
    [0xff, 0xd8],
    seg(0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, exifPayload),
    seg(0xfe, Buffer.from("shot on my phone", "latin1")),
    seg(0xdb, Buffer.alloc(65, 7)),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    [0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]
  );
  expectTrue("jpeg: fixture contains GPS text", jpegDirty.includes("GPSLatitude"));
  const jpegOut = stripImageMetadata(jpegDirty, "image/jpeg");
  expectTrue("jpeg: GPS text is gone", !jpegOut.includes("GPSLatitude"));
  expectTrue("jpeg: comment is gone", !jpegOut.includes("shot on my phone"));
  expectTrue("jpeg: result equals the clean equivalent byte for byte",
    jpegOut.equals(jpegClean), `${jpegDirty.length} -> ${jpegOut.length} (want ${jpegClean.length})`);
  expectTrue("jpeg: JFIF/APP0 preserved", jpegOut.includes("JFIF"));
  expectTrue("jpeg: scan data and EOI preserved",
    jpegOut.subarray(jpegOut.length - 6).equals(Buffer.from([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9])));
  expectTrue("jpeg: a clean file is passed through untouched",
    stripImageMetadata(jpegClean, "image/jpeg").equals(jpegClean));
  expectTrue("jpeg: bogus length returns input unchanged", (() => {
    const bad = buf([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xf0, 0x00]);
    return stripImageMetadata(bad, "image/jpeg").equals(bad);
  })());

  // ---------- WebP ----------
  const riffChunk = (fourcc: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    const pad = data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from(fourcc, "latin1"), size, data, pad]);
  };
  const vp8xFlagsExif = Buffer.concat([Buffer.from([0b0000_1100, 0, 0, 0]), Buffer.alloc(6)]);
  const webpBody = Buffer.concat([
    riffChunk("VP8X", vp8xFlagsExif),
    riffChunk("VP8 ", Buffer.alloc(10, 3)),
    riffChunk("EXIF", Buffer.from("II*\0GPSLatitude 51.5074", "latin1")),
  ]);
  const webpHeader = Buffer.alloc(12);
  webpHeader.write("RIFF", 0, "latin1");
  webpHeader.writeUInt32LE(webpBody.length + 4, 4);
  webpHeader.write("WEBP", 8, "latin1");
  const webpDirty = buf(webpHeader, webpBody);

  const webpOut = stripImageMetadata(webpDirty, "image/webp");
  expectTrue("webp: GPS text is gone", !webpOut.includes("GPSLatitude"));
  expectTrue("webp: VP8 image data preserved", webpOut.includes("VP8 "));
  expectTrue("webp: RIFF size header rewritten correctly",
    webpOut.readUInt32LE(4) === webpOut.length - 8,
    `header says ${webpOut.readUInt32LE(4)}, actual ${webpOut.length - 8}`);
  expectTrue("webp: VP8X EXIF/XMP flag bits cleared",
    (webpOut[20]! & 0b0000_1100) === 0, `flags=0b${webpOut[20]!.toString(2).padStart(8, "0")}`);

  // ---------- pass-through formats ----------
  const gif = Buffer.from("GIF89a" + "\0".repeat(20), "latin1");
  expectTrue("gif: passed through unchanged", stripImageMetadata(gif, "image/gif").equals(gif));

});
