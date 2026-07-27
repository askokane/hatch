// Deterministic identicon-style avatar, generated as an inline SVG string from a
// seed. No uploads, no external image hosts, no faces — a symmetric geometric
// grid whose colors and filled cells are derived from a hash of the seed.
//
// The output is a fixed, code-controlled SVG string. It is rendered via
// dangerouslySetInnerHTML ONLY in components/ui/Avatar.tsx, and its input is
// exclusively this hash output — never user free-text — so there is no XSS
// surface. This is the single, deliberate exception to the no-dangerous-HTML rule.

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A restrained palette drawn from the brand family — muted, no neon.
const PALETTES = [
  ["#2F6F4F", "#E8F0EB"], // pine
  ["#3B5566", "#E5ECF0"], // slate blue
  ["#8A5A2B", "#F1E8DC"], // umber
  ["#5A4E7C", "#EAE6F1"], // muted violet
  ["#7C5A2B", "#F1EADC"], // tan
  ["#4A6B52", "#E7EFE9"], // moss
  ["#B23B2E", "#F6E7E5"], // brick
  ["#3E5C4B", "#E6EEE9"], // deep green
];

export function generateAvatarSvg(seed: string, size = 96): string {
  const h = fnv1a(seed);
  const palette = PALETTES[h % PALETTES.length]!;
  const [fg, bg] = palette;

  const cells = 5;
  const cell = size / cells;
  // Build a 5x5 grid mirrored across the vertical axis (columns 0..2 drive 3..4).
  const rects: string[] = [];
  let bits = fnv1a(seed + ":cells");
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < 3; col++) {
      // pull a bit
      const on = (bits & 1) === 1;
      bits = bits >>> 1;
      if (bits === 0) bits = fnv1a(seed + `:${row}:${col}`);
      if (!on) continue;
      const x1 = col * cell;
      const x2 = (cells - 1 - col) * cell;
      rects.push(`<rect x="${x1}" y="${row * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`);
      if (x2 !== x1) {
        rects.push(`<rect x="${x2}" y="${row * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true"><rect width="${size}" height="${size}" fill="${bg}"/>${rects.join("")}</svg>`;
}

// Generates a random seed string to store on a Profile at creation.
export function newAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
