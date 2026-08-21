// Shuffles the roster into the board and freezes it to src/placement.json.
// Each run makes a NEW random board. Re-run until you like it, then commit
// + deploy. (No seed — kept simple. Add one back if this ever goes public.)
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
  3: ["12–8 AM", "8 AM–4 PM", "4 PM–12 AM"], // 8h
  4: ["12–6 AM", "6 AM–12 PM", "12–6 PM", "6 PM–12 AM"], // 6h
  6: ["12–4 AM", "4–8 AM", "8 AM–12 PM", "12–4 PM", "4–8 PM", "8 PM–12 AM"], // 4h
  8: [
    "12–3 AM",
    "3–6 AM",
    "6–9 AM",
    "9 AM–12 PM",
    "12–3 PM",
    "3–6 PM",
    "6–9 PM",
    "9 PM–12 AM",
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

// --- Fisher-Yates (plain random, new board every run) ---
for (let i = names.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [names[i], names[j]] = [names[j], names[i]];
}

// cells are row-major: index = row * cols + col
const placement = {
  rows: config.board.rows,
  cols: config.board.cols,
  cells: names,
};
writeFileSync(placementPath, JSON.stringify(placement, null, 2) + "\n");

const filled = names.filter(Boolean).length;
console.log(
  `  ✓ New board frozen: ${filled}/${size} squares filled -> src/placement.json`,
);
