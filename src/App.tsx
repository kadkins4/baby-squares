import { useMemo, useState } from "react";
import config from "./config.json";
import placement from "./placement.json";

// --- reveal timing (ms). Tune these to taste. ---
const NAME_STAGGER = 380; // between each name popping in
const NAMES_START = 450; // lead-in before names start popping
const POP_MS = 620; // pop animation duration (keep in sync with .pop in CSS)
const OPEN_GAP = 550; // pause after the last name before OPEN slots appear
const OPEN_STAGGER = 160; // between each OPEN slot fading in
const SETTLE = 500; // flourish tail after last reveal

const { rows, cols } = config.board;
const cells = placement.cells as (string | null)[];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Timing = {
  nameDelay: number[]; // per cell index (filled cells only)
  openDelay: number[]; // per cell index (open cells only)
  total: number;
};

function buildTiming(): Timing {
  // Random *visual* order (not placement — placement is frozen).
  // Names pop back-to-back first; empty slots fade in afterward.
  const all = cells.map((_, i) => i);
  const filled = shuffle(all.filter((i) => cells[i] != null));
  const open = shuffle(all.filter((i) => cells[i] == null));

  const nameDelay = new Array(cells.length);
  filled.forEach((cellIdx, pos) => {
    nameDelay[cellIdx] = NAMES_START + pos * NAME_STAGGER;
  });

  const lastName =
    NAMES_START + Math.max(0, filled.length - 1) * NAME_STAGGER + POP_MS;
  const openStart = lastName + OPEN_GAP;

  const openDelay = new Array(cells.length);
  open.forEach((cellIdx, pos) => {
    openDelay[cellIdx] = openStart + pos * OPEN_STAGGER;
  });

  const total = openStart + open.length * OPEN_STAGGER + SETTLE;

  return { nameDelay, openDelay, total };
}

type LegendEntry = { name: string; count: number; slots: string[] };

function buildLegend(): LegendEntry[] {
  const byName = new Map<string, string[]>();
  cells.forEach((name, idx) => {
    if (!name) return;
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const label = `${config.yLabels[r]} ${config.xLabels[c]}`;
    const slots = byName.get(name) ?? [];
    slots.push(label);
    byName.set(name, slots);
  });
  const list = [...byName.entries()].map(([name, slots]) => ({
    name,
    count: slots.length,
    slots,
  }));
  // highest entry count first, then alphabetical
  list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return list;
}

export default function App() {
  const [started, setStarted] = useState(false);
  // new object each start => re-randomizes the visual order and restarts CSS animations
  const [timing, setTiming] = useState<Timing | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  const legend = useMemo(buildLegend, []);
  const totalSquares = useMemo(
    () => legend.reduce((s, p) => s + p.count, 0),
    [legend],
  );

  const grid = useMemo(
    () => ({
      gridTemplateColumns: `minmax(3.5rem, auto) repeat(${cols}, minmax(0, 1fr))`,
    }),
    [],
  );
  // widen the stage for bigger boards so names aren't crushed (scrolls if still too wide)
  const stageStyle = useMemo(
    () => ({ maxWidth: `min(96vw, ${Math.max(720, cols * 120 + 90)}px)` }),
    [],
  );

  function start() {
    setTiming(buildTiming());
    setStarted(true);
  }
  function replay() {
    setStarted(false);
    // next tick restart so CSS animations re-trigger
    requestAnimationFrame(() => start());
  }

  return (
    <div className="app">
      {!started && (
        <section className="title-card">
          <h1 className="title">{config.title}</h1>
          <p className="subtitle">{config.subtitle}</p>
          <button className="start" onClick={start}>
            {config.startButtonLabel}
          </button>
        </section>
      )}

      {started && timing && (
        <section className="stage" style={stageStyle}>
          <h1 className="board-title">{config.title}</h1>
          <div className="board-wrap">
            <div className="board" style={grid}>
              <div className="corner" />
              {config.xLabels.slice(0, cols).map((label, col) => (
                <div key={`x${col}`} className="head head--x">
                  <span>{label}</span>
                </div>
              ))}

              {config.yLabels.slice(0, rows).map((label, row) => (
                <RowFragment
                  key={`row${row}`}
                  row={row}
                  label={label}
                  timing={timing}
                />
              ))}
            </div>
          </div>
          <button className="replay" onClick={replay}>
            ↻ Replay
          </button>

          <div
            className={`legend ${legendOpen ? "is-open" : "is-closed"}`}
            style={{ animationDelay: `${timing.total}ms` }}
          >
            <button
              type="button"
              className="legend-head"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
            >
              <span>
                {legendOpen
                  ? `Entries — ${legend.length} people · ${totalSquares} squares`
                  : `${legend.length} people participating`}
              </span>
              <span className="legend-toggle" aria-hidden="true">
                {legendOpen ? "▲" : "▼"}
              </span>
            </button>
            {legendOpen &&
              legend.map((p) => (
                <div className="legend-row" key={p.name}>
                  <span className="legend-count">{p.count}</span>
                  <span className="legend-name">{p.name}</span>
                  <span className="legend-slots">{p.slots.join(" · ")}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RowFragment({
  row,
  label,
  timing,
}: {
  row: number;
  label: string;
  timing: Timing;
}) {
  return (
    <>
      <div className="head head--y">
        <span>{label}</span>
      </div>
      {Array.from({ length: cols }, (_, col) => {
        const idx = row * cols + col;
        const name = cells[idx];
        const dark = (row + col) % 2 === 0;
        return (
          <div
            key={idx}
            className={`cell ${dark ? "cell--dark" : "cell--light"}`}
          >
            {name ? (
              <span
                className="name pop"
                style={{ animationDelay: `${timing.nameDelay[idx]}ms` }}
              >
                {name}
              </span>
            ) : (
              <span
                className="name name--open fade-open"
                style={{ animationDelay: `${timing.openDelay[idx]}ms` }}
              >
                OPEN
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
