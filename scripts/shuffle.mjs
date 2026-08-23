// Freezes the name -> cell placement for the board and writes src/placement.json.
//
// FAILSAFE: the shuffle is seeded off config.seed, so the board is reproducible
// and auditable — same seed always yields the same board. Re-running never
// silently rerolls a board people have already seen; to reroll you must
// deliberately change the seed in src/config.json. A missing seed is refused.
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

// --- FAILSAFE: require an explicit seed before touching the board ---
if (config.seed == null || String(config.seed).trim() === "") {
  console.error(
    `\n  ✖  No "seed" set in src/config.json.\n` +
      `     Add one (any string) to freeze a reproducible board:\n` +
      `        "seed": "your-seed-here"\n` +
      `     Same seed => same board. Change the seed to deliberately reroll.\n`,
  );
  process.exit(1);
}

// --- seeded RNG: string -> uint32 seed -> mulberry32 (deterministic) ---
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
const total = names.length;

// --- auto-scale the time columns to the roster size ---
// Rows are always the 7 days; columns split the day finer as more people buy in.
// Every time block must be EQUAL length, so the column count must divide 24h
// into whole hours -> only 1, 2, 3, 4, 6, 8 are allowed (5 and 7 can't be even).
const TIME_LABELS = {
  1: ["All Day"], // 24h
  2: ["AM", "PM"], // 12h
  3: ["12AM - 8AM", "8AM - 4PM", "4PM - 12AM"], // 8h
  4: ["12AM - 6AM", "6AM - 12PM", "12PM - 6PM", "6PM - 12AM"], // 6h
  6: [
    "12AM - 4AM",
    "4AM - 8AM",
    "8AM - 12PM",
    "12PM - 4PM",
    "4PM - 8PM",
    "8PM - 12AM",
  ], // 4h
  8: [
    "12AM - 3AM",
    "3AM - 6AM",
    "6AM - 9AM",
    "9AM - 12PM",
    "12PM - 3PM",
    "3PM - 6PM",
    "6PM - 9PM",
    "9PM - 12AM",
  ], // 3h
};
const VALID_COLS = [1, 2, 3, 4, 6, 8];
const rows = config.board.rows; // 7 days
// smallest even-block column count whose board holds the whole roster (cap at 8)
const cols = VALID_COLS.find((c) => rows * c >= total) ?? 8;
config.board.cols = cols;
config.xLabels = TIME_LABELS[cols];
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(
  `  → ${total} squares -> ${cols} time column(s): ${config.xLabels.join(" / ")}`,
);
if (total > rows * 8) {
  console.warn(
    `  ⚠  ${total} squares exceeds the 56-square max (7 x 8, 3-hour blocks). Extras will be dropped.`,
  );
}

const size = rows * cols;

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

// --- Fisher-Yates with the seeded rng (reproducible for a given seed) ---
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
  `  ✓ Board frozen (seed "${config.seed}"): ${filled}/${size} squares filled -> src/placement.json`,
);
