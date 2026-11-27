// Blue butterfly for Firefly Meadow.
//
// The butterfly is hidden most of the time. Twice per loop it enters from one
// side, flutters over the flowers, hovers briefly, then leaves. The first pass
// goes left -> right and the second right -> left. Pure SVG + CSS.

import { createRng } from "./fireflies.js";

const PX = 2;
export const LOOP_SECONDS = 120; // one full cycle (two visits)
export const PASS_STARTS = [6, 66]; // seconds into the loop
const SAMPLE_EVERY = 0.6; // seconds between keyframes (linear in between)

export const COLORS = {
  D: "#2B5FC7", // outline
  B: "#4FA8FF", // bright wing blue
  L: "#8CD0FF", // lighter wing blue
  W: "#EAF8FF", // wing spot
  K: "#1F2A55", // body
};

// Left wing, outer edge (col 0) to the body (col 4). Mirrored for the right.
export const WING = [
  ".DDD.",
  "DLLBB",
  "DLWLB",
  "DLLBB",
  ".DBBB",
  "..DBB",
  "..DD.",
];

function rects(rows, originX, originY, mirror) {
  const byColor = new Map();
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === "." || !COLORS[ch]) continue;
      const x = mirror ? 1 + (row.length - 1 - c) * PX : originX + c * PX;
      const y = originY + r * PX;
      byColor.set(
        ch,
        (byColor.get(ch) ?? "") + `M${x} ${y}h${PX}v${PX}h-${PX}z`,
      );
    }
  });
  return [...byColor]
    .map(([ch, d]) => `<path fill="${COLORS[ch]}" d="${d}"/>`)
    .join("");
}

// Sprite is centred on (0,0): body at x -1..1, wings either side.
export function buildButterflySVG() {
  const top = -(WING.length * PX) / 2;
  const leftX = -1 - WING[0].length * PX;
  const wings = rects(WING, leftX, top, false) + rects(WING, 0, top, true);
  const body = `<path fill="${COLORS.K}" d="M-1 ${top - 2}h2v${WING.length * PX + 2}h-2z M-3 ${top - 4}h2v2h-2z M1 ${top - 4}h2v2h-2z"/>`;
  return `<g class="bf-flutter"><g class="bf-flap">${wings}</g>${body}</g>`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// Plan one visit as timed samples [t, x, y] (t in seconds from pass start).
export function planPass({ direction, width, bounds, rng }) {
  const margin = 30; // start/end just outside the viewBox
  const startX = direction > 0 ? -margin : width + margin;
  const endX = direction > 0 ? width + margin : -margin;
  const hoverX = width * (0.3 + rng() * 0.4);
  const baseY = bounds.minY + 25 + rng() * (bounds.maxY - bounds.minY - 50);
  const phase = rng() * Math.PI * 2;
  const speed = 115; // px per second while travelling
  const hoverTime = 3;
  const drift = direction * 14;

  const d1 = Math.abs(hoverX - startX) / speed;
  const d3 = Math.abs(endX - hoverX - drift) / speed;
  const total = d1 + hoverTime + d3;

  const xAt = (t) => {
    if (t <= d1)
      return startX + (hoverX - startX) * Math.sin((Math.PI / 2) * (t / d1));
    if (t <= d1 + hoverTime) return hoverX + drift * ((t - d1) / hoverTime);
    const u = (t - d1 - hoverTime) / d3;
    return (
      hoverX +
      drift +
      (endX - hoverX - drift) * (1 - Math.cos((Math.PI / 2) * u))
    );
  };
  const yAt = (t) => {
    const hovering = t > d1 && t < d1 + hoverTime;
    const amp = hovering ? 0.3 : 1;
    const y =
      baseY +
      amp *
        (24 * Math.sin(phase + t * 1.1) + 9 * Math.sin(phase * 2 + t * 2.7));
    return clamp(y, bounds.minY, bounds.maxY);
  };

  const samples = [];
  for (let t = 0; t < total; t += SAMPLE_EVERY)
    samples.push([t, xAt(t), yAt(t)]);
  samples.push([total, endX, yAt(total)]);
  return {
    samples: samples.map(([t, x, y]) => [
      round1(t * 100) / 100,
      round1(x),
      round1(y),
    ]),
    total,
    hoverX,
    direction,
  };
}

export function renderButterfly({ width, height, padding, seed = 777 }) {
  const rng = createRng(seed);
  const bounds = { minY: padding + 10, maxY: height - padding - 16 };
  const passes = PASS_STARTS.map((start, i) => ({
    start,
    ...planPass({ direction: i % 2 === 0 ? 1 : -1, width, bounds, rng }),
  }));

  // Build one keyframe list for the whole loop.
  const pct = (sec) => Math.round((sec / LOOP_SECONDS) * 100000) / 1000;
  const stops = [];
  const first = passes[0].samples[0];
  stops.push([0, first[1], first[2], 0]);
  for (const p of passes) {
    const s0 = p.samples[0];
    const last = p.samples.at(-1);
    stops.push([p.start - 0.01, s0[1], s0[2], 0]); // wait, invisible, at entry
    p.samples.forEach(([t, x, y]) => stops.push([p.start + t, x, y, 1]));
    stops.push([p.start + last[0] + 0.01, last[1], last[2], 0]); // gone
  }
  stops.push([LOOP_SECONDS, first[1], first[2], 0]);

  const frames = stops
    .map(
      ([sec, x, y, o]) =>
        `${pct(Math.min(sec, LOOP_SECONDS))}%{transform:translate(${x}px,${y}px);opacity:${o}}`,
    )
    .join("");

  const css = `
@keyframes bfly{${frames}}
@keyframes bfflap{0%{transform:scaleX(1)}100%{transform:scaleX(.45)}}
@keyframes bfflutter{0%,100%{transform:translateY(-2px)}30%{transform:translateY(3px)}55%{transform:translateY(-1px)}80%{transform:translateY(2px)}}
.bf{animation:bfly ${LOOP_SECONDS}s linear infinite}
.bf-flap{transform-origin:0 0;animation:bfflap .42s ease-in-out infinite alternate}
.bf-flutter{animation:bfflutter 1.3s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.bf,.bf-flap,.bf-flutter{animation:none}.bf{opacity:0}}
`.trim();

  const svg = `<g class="bf" opacity="0" transform="translate(${first[1]} ${first[2]})">${buildButterflySVG()}</g>\n`;
  return { css, svg, passes, bounds };
}
