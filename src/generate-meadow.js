import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPRITES, PALETTES, BUD, LEAVES } from "./sprites.js";
import { renderFireflies } from "./fireflies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Meadow dimensions: one column per week, one row per weekday.
const COLUMNS = 53;
const ROWS = 7;

// One sprite pixel = PX svg units. Cells are sized so an 11x11 flower fits.
const PX = 2;
const CELL = 22;
const GAP = 0;
const PITCH = CELL + GAP;
const PADDING = 26;

const SVG_WIDTH = COLUMNS * PITCH + PADDING * 2;
const SVG_HEIGHT = ROWS * PITCH + PADDING * 2;

const FIREFLY_COUNT = 6;

// Contribution level -> which sprite to draw.
const LEVEL_SPRITES = {
  1: { kind: "bud" },
  2: { kind: "hibiscus", size: 7, leaves: "small" },
  3: { kind: "hibiscus", size: 9, leaves: "small" },
  4: { kind: "hibiscus", size: 11, leaves: "large" },
};

// Merge horizontal runs of one colour into <path> data to keep the SVG small.
function rowsToPaths(rows, palette) {
  const byColor = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === ch) end++;
      const d = `M${x * PX} ${y * PX}h${(end - x + 1) * PX}v${PX}h-${(end - x + 1) * PX}z`;
      byColor.set(palette[ch], (byColor.get(palette[ch]) ?? "") + d);
      x = end + 1;
    }
  });
  return [...byColor]
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join("");
}

// Overlay a smaller sprite on a bigger canvas (used for flower + leaves).
function compose(flower, leaves, width) {
  const out = [];
  const pad = (row) => {
    const left = Math.floor((width - row.length) / 2);
    return ".".repeat(left) + row + ".".repeat(width - row.length - left);
  };
  flower.forEach((r) => out.push(pad(r)));
  if (leaves) leaves.forEach((r) => out.push(pad(r)));
  return out;
}

function buildDefs() {
  const defs = [];
  const leafPalette = PALETTES[3];

  defs.push(`<g id="bud">${rowsToPaths(BUD, leafPalette)}</g>`);
  for (const [lvl, spec] of Object.entries(LEVEL_SPRITES)) {
    if (spec.kind !== "hibiscus") continue;
    const rows = compose(SPRITES[spec.size], LEAVES[spec.leaves], spec.size);
    defs.push(`<g id="h${lvl}">${rowsToPaths(rows, PALETTES[lvl])}</g>`);
  }
  // Grass tufts for empty days (three deterministic variants).
  const tufts = [
    ["...", "G.L", ".G."],
    ["L..", ".G.", "G.G"],
    ["..L", "G..", ".GL"],
  ];
  tufts.forEach((t, i) =>
    defs.push(
      `<g id="grass${i}">${rowsToPaths(t, { G: "#3F5E45", L: "#587A55" })}</g>`,
    ),
  );
  return defs.join("\n");
}

function placeCell(col, row, level) {
  const cellX = PADDING + col * PITCH;
  const cellY = PADDING + row * PITCH;
  if (level === 0) {
    const v = (col * 3 + row * 7) % 3;
    return `<use href="#grass${v}" x="${cellX + 8}" y="${cellY + 10}"/>`;
  }
  const spec = LEVEL_SPRITES[level];
  let w, h, id;
  if (spec.kind === "bud") {
    w = 5 * PX;
    h = BUD.length * PX;
    id = "bud";
  } else {
    const lh = LEAVES[spec.leaves].length;
    w = spec.size * PX;
    h = (spec.size + lh) * PX;
    id = `h${level}`;
  }
  const x = cellX + Math.round((CELL - w) / 2 / PX) * PX;
  const y = cellY + Math.round((CELL - h) / 2 / PX) * PX;
  let glow = "";
  if (level >= 3) {
    const cx = x + w / 2,
      cy = y + (spec.size * PX) / 2;
    const r = level === 4 ? 13 : 10;
    glow =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFB3CF" opacity="${level === 4 ? 0.12 : 0.07}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="#FFB3CF" opacity="${level === 4 ? 0.14 : 0.08}"/>`;
  }
  return `${glow}<use href="#${id}" x="${x}" y="${y}"/>`;
}

export function getContributionLevel(count) {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

// Deterministic placeholder data until the GitHub API milestone.
export function generateSampleContributions() {
  return Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => {
      const seed = (r * 17 + c * 31 + r * c * 7) % 100;
      if (seed < 30) return 0;
      if (seed < 50) return 1;
      if (seed < 68) return 3;
      if (seed < 82) return 5;
      if (seed < 94) return 8;
      return 12;
    }),
  );
}

export function generateMeadowSVG(contributions) {
  const cells = contributions
    .map((week, col) =>
      week
        .map((n, row) => placeCell(col, row, getContributionLevel(n)))
        .join(""),
    )
    .join("\n");

  const fireflies = renderFireflies({
    width: SVG_WIDTH,
    height: SVG_HEIGHT,
    padding: PADDING,
    count: FIREFLY_COUNT,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="A pixel-art flower meadow representing GitHub contributions">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15152B"/><stop offset="1" stop-color="#241F3F"/></linearGradient>
${buildDefs()}
</defs>
<style>
${fireflies.css}
</style>
<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="url(#sky)"/>
${cells}
${fireflies.svg}</svg>
`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const svg = generateMeadowSVG(generateSampleContributions());
  const outDir = path.join(projectRoot, "dist");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, "meadow.svg");
  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(
    "Firefly Meadow generated:",
    outputPath,
    `(${(svg.length / 1024).toFixed(1)} KB)`,
  );
}
