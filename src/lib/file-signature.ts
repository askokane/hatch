const MAX_IMAGE_PIXELS = 40_000_000;

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function validateFileBytes(bytes: Buffer, claimedMime: string): boolean {
  let dimensions: { width: number; height: number } | null = null;
  if (claimedMime === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return false;
    dimensions = jpegDimensions(bytes);
  } else if (claimedMime === "image/png") {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
    dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (claimedMime === "image/gif") {
    if (bytes.length < 10 || !["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return false;
    dimensions = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (claimedMime === "image/webp") {
    if (bytes.length < 16 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") return false;
    return true;
  } else if (claimedMime === "video/webm") {
    return bytes.length >= 4 && bytes.subarray(0, 4).toString("hex") === "1a45dfa3";
  } else if (["video/mp4", "video/quicktime"].includes(claimedMime)) {
    return bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  } else return false;
  return !!dimensions && dimensions.width > 0 && dimensions.height > 0 && dimensions.width * dimensions.height <= MAX_IMAGE_PIXELS;
}
