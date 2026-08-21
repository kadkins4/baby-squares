import { useMemo, useState } from "react";
import config from "./config.json";
import placement from "./placement.json";

// --- reveal timing (ms). Tune these to taste. ---
const NAME_STAGGER = 200; // between each name popping in
const NAMES_START = 350; // lead-in before names start popping
const SETTLE = 500; // flourish tail after last name

const { rows, cols } = config.board;
const cells = placement.cells as (string | null)[];

function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Timing = {
  nameDelay: number[]; // per cell index
  total: number;
};

function buildTiming(): Timing {
  // Random *visual* pop order (not placement — placement is frozen).
  // Axis headers are static (fixed order), so only the names animate.
  const nameOrder = shuffledIndices(rows * cols);

  const nameDelay = new Array(rows * cols);
  nameOrder.forEach((cellIdx, pos) => {
    nameDelay[cellIdx] = NAMES_START + pos * NAME_STAGGER;
  });
  const total = NAMES_START + rows * cols * NAME_STAGGER + SETTLE;

  return { nameDelay, total };
}

export default function App() {
  const [started, setStarted] = useState(false);
  // new object each start => re-randomizes the visual order and restarts CSS animations
  const [timing, setTiming] = useState<Timing | null>(null);

  const grid = useMemo(
    () => ({
      gridTemplateColumns: `minmax(3.5rem, auto) repeat(${cols}, minmax(0, 1fr))`,
    }),
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
        <section className="stage">
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
              <span className="name name--open">OPEN</span>
            )}
          </div>
        );
      })}
    </>
  );
}
