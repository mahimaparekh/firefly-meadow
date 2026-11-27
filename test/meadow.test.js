import test from "node:test";
import assert from "node:assert/strict";
import {
  generateMeadowSVG,
  generateSampleContributions,
  getContributionLevel,
} from "../src/generate-meadow.js";
import { SPRITES, BUD, LEAVES } from "../src/sprites.js";

test("contribution counts map to five levels", () => {
  assert.deepEqual(
    [0, 1, 3, 4, 6, 7, 9, 10, 50].map(getContributionLevel),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});

test("same data always produces identical SVG", () => {
  const data = generateSampleContributions();
  assert.equal(generateMeadowSVG(data), generateMeadowSVG(data));
});

test("grid keeps 53 weeks x 7 days", () => {
  const data = generateSampleContributions();
  assert.equal(data.length, 53);
  assert.ok(data.every((w) => w.length === 7));
});

test("sprites are square, correctly sized and use only known colour keys", () => {
  for (const n of [7, 9, 11]) {
    assert.equal(SPRITES[n].length, n);
    assert.ok(SPRITES[n].every((r) => r.length === n));
    assert.match(SPRITES[n].join(""), /^[.PDHTYO]+$/);
  }
  assert.ok(BUD.every((r) => r.length === 5));
  assert.ok(
    Object.values(LEAVES).every((rows) =>
      rows.every((r) => /^[.GL]+$/.test(r)),
    ),
  );
});

test("SVG contains no script or external references", () => {
  const svg = generateMeadowSVG(generateSampleContributions());
  assert.ok(!/<script|href="http|onload/i.test(svg));
});

import { renderFireflies } from "../src/fireflies.js";

const FF_OPTS = { width: 1192, height: 206, padding: 26 };

test("renders exactly 6 fireflies by default and is deterministic", () => {
  const a = renderFireflies(FF_OPTS);
  const b = renderFireflies(FF_OPTS);
  assert.equal(a.flies.length, 6);
  assert.equal(a.svg, b.svg);
  assert.equal(a.css, b.css);
});

test("firefly paths stay inside the meadow and loop seamlessly", () => {
  const { flies, bounds } = renderFireflies(FF_OPTS);
  for (const f of flies) {
    assert.deepEqual(f.points[0], f.points.at(-1));
    assert.equal(f.stops[0], 0);
    assert.equal(f.stops.at(-1), 100);
    assert.equal(f.stops.length, f.points.length);
    for (const [x, y] of f.points) {
      assert.ok(x >= bounds.minX && x <= bounds.maxX);
      assert.ok(y >= bounds.minY && y <= bounds.maxY);
    }
  }
});

test("fireflies have different speeds and are not in sync", () => {
  const { flies } = renderFireflies(FF_OPTS);
  assert.ok(new Set(flies.map((f) => f.duration)).size >= 5);
  assert.ok(new Set(flies.map((f) => f.delay)).size >= 5);
});

test("reduced-motion preference disables animation", () => {
  assert.match(renderFireflies(FF_OPTS).css, /prefers-reduced-motion:reduce/);
});

import {
  renderButterfly,
  WING,
  LOOP_SECONDS,
  PASS_STARTS,
  buildButterflySVG,
} from "../src/butterfly.js";

test("butterfly is deterministic and visits from alternating sides", () => {
  const a = renderButterfly(FF_OPTS);
  const b = renderButterfly(FF_OPTS);
  assert.equal(a.css, b.css);
  assert.equal(a.svg, b.svg);
  const [left, right] = a.passes;
  assert.ok(left.samples[0][1] < 0 && left.samples.at(-1)[1] > FF_OPTS.width);
  assert.ok(right.samples[0][1] > FF_OPTS.width && right.samples.at(-1)[1] < 0);
});

test("butterfly is only visible occasionally and hovers mid-flight", () => {
  const { passes } = renderButterfly(FF_OPTS);
  const visible = passes.reduce((sum, p) => sum + p.total, 0);
  assert.ok(visible / LOOP_SECONDS < 0.3);
  for (const [i, p] of passes.entries()) {
    assert.ok(PASS_STARTS[i] + p.total < (PASS_STARTS[i + 1] ?? LOOP_SECONDS));
    // Hover = a stretch of >= 2s where it barely moves horizontally.
    const slow = p.samples.filter(
      (s, k) => k > 0 && Math.abs(s[1] - p.samples[k - 1][1]) < 4,
    );
    assert.ok(slow.length * 0.6 >= 2);
  }
});

test("butterfly keyframes are ordered and stay inside the meadow vertically", () => {
  const { css, bounds, passes } = renderButterfly(FF_OPTS);
  const pcts = [...css.matchAll(/([\d.]+)%\{transform:translate\(/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(pcts[0], 0);
  assert.equal(pcts.at(-1), 100);
  assert.ok(pcts.every((v, i) => i === 0 || v >= pcts[i - 1]));
  for (const p of passes)
    for (const [, , y] of p.samples)
      assert.ok(y >= bounds.minY && y <= bounds.maxY);
});

test("butterfly starts hidden and disappears under reduced motion", () => {
  const { svg, css } = renderButterfly(FF_OPTS);
  assert.match(svg, /opacity="0"/);
  assert.match(
    css,
    /prefers-reduced-motion:reduce\)\{\.bf,\.bf-flap,\.bf-flutter\{animation:none\}\.bf\{opacity:0\}/,
  );
});

test("butterfly sprite wing is rectangular and symmetric output renders", () => {
  assert.ok(WING.every((r) => r.length === WING[0].length));
  assert.match(buildButterflySVG(), /bf-flap/);
});

import {
  swayGroupFor,
  pulseGroupFor,
  SWAY_GROUPS,
  PULSE_GROUPS,
  motionCss,
} from "../src/flower-motion.js";

test("flower group assignment is deterministic and spreads flowers out", () => {
  const counts = Array(SWAY_GROUPS).fill(0);
  for (let c = 0; c < 53; c++) {
    for (let r = 0; r < 7; r++) {
      assert.equal(swayGroupFor(c, r), swayGroupFor(c, r));
      assert.ok(pulseGroupFor(c, r) < PULSE_GROUPS);
      counts[swayGroupFor(c, r)]++;
    }
  }
  // Every group is used and none dominates (371 cells / 5 groups ~ 74 each).
  assert.ok(
    counts.every((n) => n > 40 && n < 110),
    counts.join(","),
  );
});

test("motion uses a few shared animations, not one per flower", () => {
  const svg = generateMeadowSVG(generateSampleContributions());
  const swayGroups = svg.match(/<g class="sw\d">/g) ?? [];
  const pulseGroups = svg.match(/<g class="pl\d">/g) ?? [];
  assert.equal(swayGroups.length, SWAY_GROUPS);
  assert.equal(pulseGroups.length, PULSE_GROUPS);
  assert.ok(!/<use[^>]*class=/.test(svg));
});

test("every flower head is drawn inside a sway group, stems stay static", () => {
  const svg = generateMeadowSVG(generateSampleContributions());
  const swayHeads = [...svg.matchAll(/<g class="sw\d">(.*?)<\/g>/gs)].flatMap(
    (m) => m[1].match(/<use/g) ?? [],
  );
  const flowers = generateSampleContributions()
    .flat()
    .filter((n) => n > 0).length;
  assert.equal(swayHeads.length, flowers);
});

test("flower motion respects reduced motion", () => {
  assert.match(motionCss(), /prefers-reduced-motion:reduce\)\{\.sw0/);
});
