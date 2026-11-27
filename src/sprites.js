// Pixel-art flower sprites for Firefly Meadow.
//
// Sprites are built from small character grids. Hibiscus petals are generated
// from a polar "five-lobed" mask so the same design scales cleanly to 7x7, 9x9
// and 11x11 pixels. Everything is deterministic: no Math.random().

// Colour palettes: higher contribution levels use warmer, brighter pinks.
export const PALETTES = {
  2: {
    D: "#B8446F",
    P: "#DE6F94",
    H: "#F2A3BF",
    T: "#A12F5E",
    Y: "#FFD36A",
    O: "#F49B50",
    G: "#5E8B5A",
    L: "#7FAE6F",
  },
  3: {
    D: "#C44C78",
    P: "#EA7BA0",
    H: "#F8B4CC",
    T: "#B0336A",
    Y: "#FFD870",
    O: "#F7A455",
    G: "#5E8B5A",
    L: "#86B576",
  },
  4: {
    D: "#D2557F",
    P: "#F58AAB",
    H: "#FFC3D6",
    T: "#C23A72",
    Y: "#FFE07E",
    O: "#FFAE5C",
    G: "#62925E",
    L: "#8CBF7C",
  },
};

const TAU = Math.PI * 2;

// Build an NxN hibiscus: five rounded petals, dark throat, stamen column.
export function buildHibiscus(size) {
  const c = (size - 1) / 2;
  const R = size / 2;
  const rows = [];

  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      // Angle measured clockwise from "up", 0..TAU.
      let a = Math.atan2(dx, -dy);
      if (a < 0) a += TAU;

      // Which petal, and how far from its centre line (-1..1).
      const slot = (a + TAU / 10) / (TAU / 5);
      const local = (slot - Math.floor(slot) - 0.5) * 2;
      const edge = Math.abs(local); // 0 = petal middle, 1 = notch between petals

      // Petal outline: round lobes with a notch between them.
      const reach = R * (1.0 - 0.34 * edge * edge * edge);
      let ch = ".";
      if (r <= reach + 0.15) {
        const t = r / reach;
        if (r < R * 0.22)
          ch = "T"; // throat
        else if (edge > 0.86 && t > 0.3)
          ch = "D"; // notch line
        else if (t > 0.78)
          ch = "P"; // rim
        else if (t < 0.45)
          ch = "T"; // inner colour
        else ch = "H";
      }
      row += ch;
    }
    rows.push(row);
  }

  // Stamen: a short column from the centre toward the upper right,
  // ending in yellow pollen.
  const len = Math.max(2, Math.round(size * 0.38));
  const set = (x, y, ch) => {
    if (y >= 0 && y < size && x >= 0 && x < size) {
      rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
    }
  };
  const cx = Math.round(c);
  const cy = Math.round(c);
  for (let i = 0; i < len; i++) {
    set(cx + Math.round(i * 0.7), cy - Math.round(i * 0.8), "Y");
  }
  const tx = cx + Math.round((len - 1) * 0.7);
  const ty = cy - Math.round((len - 1) * 0.8);
  set(tx + 1, ty, "O");
  set(tx, ty - 1, "O");
  return rows;
}

// A little hibiscus bud on a stem, for the lowest activity level.
export const BUD = ["..P..", ".PHP.", ".PHP.", ".GDG.", "..G..", "..G.."];

// Leaves sit under the flower. Two sizes.
export const LEAVES = {
  small: ["G.....G", ".LG.GL."],
  large: ["G.......G", ".LLG.GLL.", "..GG.GG.."],
};

export const SPRITES = {
  7: buildHibiscus(7),
  9: buildHibiscus(9),
  11: buildHibiscus(11),
};

// Used for previewing the sprite sheet during development.
export function spriteToText(rows) {
  return rows.join("\n");
}
