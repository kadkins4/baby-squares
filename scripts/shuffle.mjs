// Freezes the name -> cell placement for the board.
// Reads src/config.json, shuffles with the config seed, writes src/placement.json.
// Same seed => same board (reproducible / auditable). Change the seed to reroll.
//
//   npm run shuffle
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "src", "config.json");
const placementPath = join(root, "src", "placement.json");

const config = JSON.parse(readFileSync(configPath, "utf8"));
const size = config.board.rows * config.board.cols;

// --- seeded RNG: string -> uint32 seed -> mulberry32 ---
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(hashSeed(String(config.seed)));

// --- expand roster into one entry per square ---
const names = [];
for (const entry of config.roster) {
  const n = Math.max(0, Math.floor(entry.squares ?? 1));
  for (let i = 0; i < n; i++) names.push(entry.name);
}

// --- validate against board size (warn, don't hard-block) ---
if (names.length !== size) {
  const verb = names.length < size ? "under" : "OVER";
  console.warn(
    `\n  ⚠  Roster fills ${names.length}/${size} squares (${verb}-booked).`,
  );
  if (names.length < size) {
    console.warn(`     ${size - names.length} square(s) will be left OPEN.\n`);
  } else {
    console.warn(
      `     ${names.length - size} square(s) won't fit and will be dropped.\n`,
    );
  }
}

// pad with nulls (OPEN) or truncate to board size
while (names.length < size) names.push(null);
names.length = size;

// --- Fisher-Yates with seeded rng ---
for (let i = names.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [names[i], names[j]] = [names[j], names[i]];
}

// cells are row-major: index = row * cols + col
const placement = {
  seed: config.seed,
  rows: config.board.rows,
  cols: config.board.cols,
  cells: names,
};
writeFileSync(placementPath, JSON.stringify(placement, null, 2) + "\n");

const filled = names.filter(Boolean).length;
console.log(
  `  ✓ Froze placement: ${filled}/${size} squares filled -> src/placement.json`,
);
console.log(
  `    seed "${config.seed}" — rerun with the same seed for the same board.`,
);
