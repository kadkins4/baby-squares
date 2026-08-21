# Baby Squares

SuperBowl-style squares for a baby's arrival. 2D grid (days × time segments),
frozen random name placement, cinematic reveal. Static, no backend.

## Run it

```bash
npm install
npm run dev        # local dev
npm run build      # production build -> dist/
```

## Set up a game

1. Edit `src/config.json`:
   - `title`, `subtitle` — the title card text.
   - `board.rows` / `board.cols` — grid size (default 7 × 4 = 28 squares).
   - `yLabels` (rows) / `xLabels` (columns) — axis headers.
   - `roster` — one entry per person: `{ "name": "...", "squares": N }`.
2. Freeze the placement:
   ```bash
   npm run shuffle
   ```
   Shuffles the roster into the grid and writes `src/placement.json`. Every run
   makes a new random board — re-run until you like it, then commit. It warns if
   the roster doesn't fill the board exactly; unfilled squares render as `OPEN`.
3. `npm run build` and deploy `dist/` to Vercel.

The reveal is self-played: each viewer opens the page and hits **Start reveal**.
For the group moment, run it once on your screen and screen-share.

## Deploy (Vercel)

Framework preset: **Vite**. Build command `npm run build`, output `dist`.
`vercel.json` is included for a bare `vercel deploy` too.

## Reveal timing

Tune the constants at the top of `src/App.tsx` (`FLIP_STAGGER`, `NAME_STAGGER`,
etc.) to speed up or slow down the crescendo.

## Not in v1 (backlog)

- Winner reveal (enter birth day+time → spotlight the winning square).
- Setup UI + backend for other people to run their own boards.
- Prize tiers.
