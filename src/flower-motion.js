// Gentle flower motion for Firefly Meadow.
//
// To stay lightweight, flowers are NOT animated one by one. Instead every
// flower is assigned (deterministically, from its grid position) to one of a
// few shared groups, and each group has a single CSS animation:
//   - SWAY groups move flower heads +-1px. Stems and leaves stay still.
//   - PULSE groups breathe the soft halo behind level 3-4 flowers.
// That is 5 + 3 animations in total, however many flowers there are.

export const SWAY_GROUPS = 5;
export const PULSE_GROUPS = 3;

// Small integer hash so neighbouring flowers land in different groups
// without visible diagonal stripes. Same input, same output, always.
function hash(col, row, salt) {
  let h =
    Math.imul(col + 1, 73856093) ^
    Math.imul(row + 1, 19349663) ^
    Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export const swayGroupFor = (col, row) => hash(col, row, 1) % SWAY_GROUPS;
export const pulseGroupFor = (col, row) => hash(col, row, 2) % PULSE_GROUPS;

const SWAY_TIMING = [
  [4.7, -1.2],
  [5.3, -3.9],
  [5.9, -0.4],
  [6.4, -2.8],
  [7.1, -5.1],
];
const PULSE_TIMING = [
  [3.4, -0.5],
  [4.2, -1.6],
  [5.1, -3.0],
];

export function motionCss() {
  const sway = SWAY_TIMING.map(
    ([d, delay], i) =>
      `.sw${i}{animation:sway ${d}s ease-in-out ${delay}s infinite}`,
  ).join("\n");
  const pulse = PULSE_TIMING.map(
    ([d, delay], i) =>
      `.pl${i}{animation:pulse ${d}s ease-in-out ${delay}s infinite}`,
  ).join("\n");
  return `
@keyframes sway{0%,100%{transform:translateX(0)}35%{transform:translateX(1px)}70%{transform:translateX(-1px)}}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}
${sway}
${pulse}
@media (prefers-reduced-motion:reduce){${[...SWAY_TIMING.keys()].map((i) => `.sw${i}`).join(",")},${[...PULSE_TIMING.keys()].map((i) => `.pl${i}`).join(",")}{animation:none}}
`.trim();
}
