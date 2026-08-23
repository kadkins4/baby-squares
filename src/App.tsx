import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

const PORTFOLIO = "https://kendalladkins.dev";

// Kenny's site mark: dark tile, "K" cream + "A." bronze (from kendalladkins.dev/icon.svg)
function KaMark() {
  return (
    <svg className="link-chip-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0d0b09" />
      <text
        x="4"
        y="23"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="16"
      >
        <tspan fill="#ebe6e0">K</tspan>
        <tspan fill="#a08060">A.</tspan>
      </text>
    </svg>
  );
}

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

type SlotDetail = { day: string; time: string; label: string };
type LegendEntry = {
  name: string;
  count: number;
  slots: string[]; // "Sun 12AM - 3AM" (desktop legend)
  detail: SlotDetail[]; // structured (mobile "Mine" view)
};

function buildLegend(): LegendEntry[] {
  const byName = new Map<string, SlotDetail[]>();
  cells.forEach((name, idx) => {
    if (!name) return;
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const day = config.yLabels[r];
    const time = config.xLabels[c];
    const arr = byName.get(name) ?? [];
    arr.push({ day, time, label: `${day} ${time}` });
    byName.set(name, arr);
  });
  const list = [...byName.entries()].map(([name, detail]) => ({
    name,
    count: detail.length,
    slots: detail.map((d) => d.label),
    detail,
  }));
  // highest entry count first, then alphabetical
  list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return list;
}

// --- derived data (deterministic, computed once) ---
const legend = buildLegend();
const filledSquares = legend.reduce((s, p) => s + p.count, 0);
const boardSquares = rows * cols;
const prizePool = filledSquares * (config.pricePerSquare ?? 5);

// stable per-person color so folks can spot themselves on the shrunk board
const CELL_PALETTE = [
  "#3b82f6",
  "#60a5fa",
  "#2563eb",
  "#38bdf8",
  "#818cf8",
  "#0ea5e9",
  "#6366f1",
  "#22d3ee",
  "#93c5fd",
];
const colorFor: Record<string, string> = {};
legend.forEach(
  (p, i) => (colorFor[p.name] = CELL_PALETTE[i % CELL_PALETTE.length]),
);

// up to 3 initials, one char per word; keeps "&" (e.g. "Libby & Drbal" -> L&D)
const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

// "12AM - 3AM" -> "12a" for the tiny mobile board header
function shortTime(label: string) {
  if (!label.includes("-")) return label;
  const start = label.split("-")[0].trim();
  return start
    .replace(/\s+/g, "")
    .replace(/AM/i, "a")
    .replace(/PM/i, "p")
    .toLowerCase();
}

const TABS = [
  { key: "board", label: "Board", ic: "▦" },
  { key: "days", label: "By day", ic: "❯" },
  { key: "mine", label: "Mine", ic: "◈" },
] as const;
type ViewKey = (typeof TABS)[number]["key"];

function useIsMobile(query = "(max-width: 640px)") {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export default function App() {
  const [started, setStarted] = useState(false);
  // new object each start => re-randomizes the visual order and restarts CSS animations
  const [timing, setTiming] = useState<Timing | null>(null);
  const [done, setDone] = useState(false); // reveal finished (or skipped)
  const [legendOpen, setLegendOpen] = useState(true);
  const [view, setView] = useState<ViewKey>("board"); // mobile tab
  const [selCell, setSelCell] = useState<number | null>(null); // mobile board tap
  const [selName, setSelName] = useState<string | null>(null); // mobile "Mine"
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();

  const isMobile = useIsMobile();
  // switcher only appears after the reveal; until then the board is the moment
  const activeView: ViewKey = done ? view : "board";

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
    const t = buildTiming();
    clearTimeout(doneTimer.current);
    setTiming(t);
    setDone(false);
    setSelCell(null);
    setStarted(true);
    doneTimer.current = setTimeout(() => setDone(true), t.total);
  }
  function skip() {
    clearTimeout(doneTimer.current);
    setDone(true);
  }
  function replay() {
    setStarted(false);
    setDone(false);
    setView("board");
    setSelCell(null);
    // next tick restart so CSS animations re-trigger
    requestAnimationFrame(() => start());
  }
  function selectView(key: ViewKey) {
    // tapping a different view mid-reveal auto-finishes it, then jumps there
    if (key !== "board" && !done) skip();
    setView(key);
  }
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const statsBlock = (
    <div className="board-stats">
      <span className="board-stat">
        {filledSquares} / {boardSquares} squares filled
      </span>
      <span className="board-stat-sep" aria-hidden="true">
        ·
      </span>
      <span className="board-stat">
        ${prizePool.toLocaleString()} Prize Pool
      </span>
    </div>
  );

  return (
    <div className="app">
      <a
        className="link-chip"
        href={PORTFOLIO}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Kendall Adkins portfolio, kendalladkins.dev (opens in a new tab)"
      >
        <KaMark />
        <span className="link-chip-text">Kendall Adkins</span>
        <span className="link-chip-ext" aria-hidden="true">
          ↗
        </span>
      </a>

      {!started && (
        <section className="title-card">
          <h1 className="title">{config.title}</h1>
          <p className="subtitle">{config.subtitle}</p>
          <button className="start" onClick={start}>
            {config.startButtonLabel}
          </button>
        </section>
      )}

      {started &&
        timing &&
        (isMobile ? (
          <div className={`m-shell ${done ? "is-done" : "is-revealing"}`}>
            <header className="m-head">
              <h1 className="app-title">{config.title}</h1>
              {statsBlock}
              {done && (
                <button
                  className="m-replay"
                  onClick={replay}
                  aria-label="Replay reveal"
                >
                  ↻
                </button>
              )}
            </header>

            <main className="m-body">
              {activeView === "board" && (
                <MobileBoard
                  timing={timing}
                  done={done}
                  sel={selCell}
                  onSelect={setSelCell}
                  onSkip={skip}
                />
              )}
              {activeView === "days" && <SwipeDays />}
              {activeView === "mine" && (
                <Finder sel={selName} onSelect={setSelName} />
              )}
            </main>

            <nav className="m-tabbar" aria-label="Board views">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={view === t.key ? "on" : ""}
                  aria-pressed={view === t.key}
                  onClick={() => selectView(t.key)}
                >
                  <span className="m-tab-ic" aria-hidden="true">
                    {t.ic}
                  </span>
                  <span className="m-tab-lb">{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        ) : (
          <section
            className={`stage ${done ? "is-done" : "is-revealing"}`}
            style={stageStyle}
          >
            <h1 className="board-title">{config.title}</h1>
            {statsBlock}
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
            {done ? (
              <button className="replay" onClick={replay}>
                ↻ Replay
              </button>
            ) : (
              <button className="replay" onClick={skip}>
                ⏭ Skip reveal
              </button>
            )}

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
                    ? `Entries - ${legend.length} Participants`
                    : `${legend.length} Participants`}
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
                    <span className="legend-slots">
                      {p.slots.map((s, i) => (
                        <span className="legend-slot" key={i}>
                          {s}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        ))}
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

// ---------- mobile: fit-to-width board (keeps the reveal) ----------
function MobileBoard({
  timing,
  done,
  sel,
  onSelect,
  onSkip,
}: {
  timing: Timing;
  done: boolean;
  sel: number | null;
  onSelect: (i: number | null) => void;
  onSkip: () => void;
}) {
  const info =
    sel == null
      ? null
      : {
          name: cells[sel],
          day: config.yLabels[Math.floor(sel / cols)],
          time: config.xLabels[sel % cols],
        };

  return (
    <div className="m-board-wrap">
      <div
        className={`m-board ${done ? "is-done" : ""}`}
        style={{ gridTemplateColumns: `1.4rem repeat(${cols}, 1fr)` }}
      >
        <div className="m-corner" />
        {config.xLabels.slice(0, cols).map((label, c) => (
          <div key={`h${c}`} className="m-th">
            {shortTime(label)}
          </div>
        ))}
        {config.yLabels.slice(0, rows).map((day, r) => (
          <Fragment key={r}>
            <div className="m-th m-th--day">{day}</div>
            {Array.from({ length: cols }, (_, c) => {
              const idx = r * cols + c;
              const name = cells[idx];
              const selected = sel === idx;
              const slotLabel = `${config.yLabels[r]} ${config.xLabels[c]}`;
              return name ? (
                <button
                  key={idx}
                  className={`m-cell pop ${selected ? "sel" : ""}`}
                  style={{
                    background: colorFor[name],
                    animationDelay: `${timing.nameDelay[idx]}ms`,
                  }}
                  aria-label={`${name}, ${slotLabel}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : idx)}
                >
                  {initialsOf(name)}
                </button>
              ) : (
                <button
                  key={idx}
                  className={`m-cell m-cell--open fade-open ${
                    selected ? "sel" : ""
                  }`}
                  style={{ animationDelay: `${timing.openDelay[idx]}ms` }}
                  aria-label={`Open, ${slotLabel}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : idx)}
                >
                  ·
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      {done ? (
        <>
          <p className="m-board-hint">Whole board · tap a square</p>
          <div className="m-board-detail" aria-live="polite">
            {info ? (
              info.name ? (
                <>
                  <b>{info.name}</b> — {info.day} {info.time}
                </>
              ) : (
                <>
                  <b>OPEN</b> — {info.day} {info.time}
                </>
              )
            ) : (
              "Tap any square to see who has it."
            )}
          </div>
        </>
      ) : (
        <button className="m-skip m-skip--board" onClick={onSkip}>
          ⏭ Skip reveal
        </button>
      )}
    </div>
  );
}

// ---------- mobile: swipe one day at a time ----------
function SwipeDays() {
  const [dayIdx, setDayIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setDayIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div className="m-swipe-wrap">
      <div className="m-swipe" ref={ref} onScroll={onScroll}>
        {config.yLabels.slice(0, rows).map((day, r) => (
          <section className="m-day" key={r} aria-label={day}>
            <h3 className="m-day-h">{day}</h3>
            {config.xLabels.slice(0, cols).map((time, c) => {
              const name = cells[r * cols + c];
              return (
                <div key={c} className={`m-slot ${name ? "" : "is-open"}`}>
                  <span className="m-slot-time">{time}</span>
                  <span className="m-slot-who">
                    {name ? (
                      <>
                        <span
                          className="m-swatch"
                          style={{ background: colorFor[name] }}
                        />
                        {name}
                      </>
                    ) : (
                      "OPEN"
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="m-dots" aria-hidden="true">
        {config.yLabels.slice(0, rows).map((_, r) => (
          <i key={r} className={r === dayIdx ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

// ---------- mobile: find your square ----------
function Finder({
  sel,
  onSelect,
}: {
  sel: string | null;
  onSelect: (n: string) => void;
}) {
  const people = [...legend].sort((a, b) => a.name.localeCompare(b.name));
  const chosen = sel ? legend.find((p) => p.name === sel) : null;
  return (
    <div className="m-finder">
      <h3 className="m-finder-h">Find your square</h3>
      <p className="m-finder-sub">Tap your name</p>
      <div className="m-namepick">
        {people.map((p) => (
          <button
            key={p.name}
            className={sel === p.name ? "active" : ""}
            aria-pressed={sel === p.name}
            onClick={() => onSelect(p.name)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {chosen && (
        <div className="m-result">
          <div className="m-rc-name">
            <span
              className="m-swatch"
              style={{
                background: colorFor[chosen.name],
                width: 12,
                height: 12,
              }}
            />
            {chosen.name}
          </div>
          <div className="m-rc-count">
            {chosen.count} square{chosen.count > 1 ? "s" : ""}
          </div>
          {chosen.detail.map((d, i) => (
            <div className="m-rc-slot" key={i}>
              <span className="m-rc-day">{d.day}</span>
              {d.time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
