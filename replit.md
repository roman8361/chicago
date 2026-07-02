# Roulette Dealer Trainer

A browser-based roulette dealer training tool featuring a full European roulette table, racetrack, configurable chip denominations, and spin simulation.

## Run & Operate

- `pnpm --filter @workspace/roulette-trainer run dev` — run the trainer (port 5000, via the "Roulette Dealer Trainer" workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS, shadcn/ui (Radix UI), Framer Motion, wouter (routing)
- No backend or database — fully client-side app

## Where things live

- `artifacts/roulette-trainer/src/` — all app source
  - `pages/RouletteTable.tsx` — main game screen
  - `pages/SettingsScreen.tsx` — chip/limit configuration
  - `types/gameSettings.ts` — shared settings type & defaults
  - `data/` — roulette number/color data
  - `components/` — UI components (table, racetrack, chips, etc.)

## Architecture decisions

- Pure frontend — no server or database needed; all state is in-component React state.
- wouter used for routing (lightweight alternative to React Router).

## Product

A training aid for roulette dealers: spin the wheel, place bets on the table or racetrack, configure chip denominations and table limits.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm install` from the workspace root if `node_modules` is missing before starting the workflow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
