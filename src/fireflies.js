// Firefly animation for Firefly Meadow.
//
// Pure SVG + CSS (no JavaScript inside the SVG). Every firefly follows its own
// closed wandering path built from seeded random waypoints, so the result is
// organic-looking but identical on every run.

// Small deterministic PRNG (mulberry32).
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// Plan one firefly: waypoints (closed loop), keyframe stops, timings.
export function planFirefly(index, bounds, seed) {
  const rng = createRng(seed + index * 7919);
  const { minX, maxX, minY, maxY } = bounds;
  const WAYPOINTS = 9;

  // Spread starting points across the meadow so fireflies don't clump.
  const slot = (maxX - minX) / 6;
  let x = minX + slot * index + rng() * slot;
  let y = minY + rng() * (maxY - minY);
  const points = [[round1(x), round1(y)]];

  for (let i = 1; i < WAYPOINTS; i++) {
    // Wander mostly sideways, with gentler vertical drift.
    x = clamp(x + (rng() - 0.5) * 230, minX, maxX);
    y = clamp(y + (rng() - 0.5) * 90, minY, maxY);
    points.push([round1(x), round1(y)]);
  }
  points.push(points[0]); // close the loop for a seamless repeat

  // Uneven spacing between waypoints = speed changes along the path.
  const weights = points.slice(1).map(() => 0.6 + rng() * 0.9);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const stops = [0, ...weights.map((w) => round1((acc += (w / total) * 100)))];
  stops[stops.length - 1] = 100;

  const duration = Math.round(34 + rng() * 38); // 34-72 s per lap
  return {
    index,
    points,
    stops,
    duration,
    delay: -Math.round(rng() * duration), // start mid-path, not in sync
    pulse: round1(2.4 + rng() * 2.4), // glow cycle, seconds
    pulseDelay: -round1(rng() * 4),
    bob: round1(2.6 + rng() * 2.2), // tiny vertical hover, seconds
  };
}

export function renderFireflies({
  width,
  height,
  padding,
  count = 6,
  seed = 20260101,
}) {
  const bounds = {
    minX: padding + 8,
    maxX: width - padding - 8,
    minY: padding + 8,
    maxY: height - padding - 8,
  };
  const flies = Array.from({ length: count }, (_, i) =>
    planFirefly(i, bounds, seed),
  );

  let css = `
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes bob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(2px)}}
.ff-bob{animation:bob var(--b) ease-in-out infinite alternate}
.ff-glow{animation:glow var(--p) ease-in-out var(--pd) infinite}
@media (prefers-reduced-motion:reduce){.ff,.ff-bob,.ff-glow{animation:none}.ff-glow{opacity:.8}}
`;

  let body = "";
  for (const f of flies) {
    const frames = f.points
      .map(
        ([px, py], i) => `${f.stops[i]}%{transform:translate(${px}px,${py}px)}`,
      )
      .join("");
    css += `@keyframes fly${f.index}{${frames}}\n`;
    css += `.f${f.index}{animation:fly${f.index} ${f.duration}s ease-in-out ${f.delay}s infinite}\n`;

    const [sx, sy] = f.points[0];
    body +=
      `<g class="ff f${f.index}" transform="translate(${sx} ${sy})">` +
      `<g class="ff-bob" style="--b:${f.bob}s">` +
      `<g class="ff-glow" style="--p:${f.pulse}s;--pd:${f.pulseDelay}s">` +
      `<circle r="10" fill="#FFD36A" opacity=".1"/>` +
      `<circle r="6" fill="#FFD36A" opacity=".22"/><circle r="3.5" fill="#FFE98A" opacity=".4"/>` +
      `</g>` +
      `<rect x="-1.5" y="-1.5" width="3" height="3" fill="#FFF1A8"/>` +
      `</g></g>\n`;
  }
  return { css: css.trim(), svg: body, flies, bounds };
}
