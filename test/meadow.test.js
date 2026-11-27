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
