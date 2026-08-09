# Roulette Dealer Trainer

A browser-based trainer for roulette dealers. Simulates a full European roulette table with betting layout, racetrack (French bets), chip selection, and payout logic.

## Stack

- **Frontend**: React 19 + Vite 7, TypeScript, Tailwind CSS v4, Radix UI, Framer Motion
- **Routing**: Wouter
- **Data fetching**: TanStack Query
- **Package manager**: pnpm (workspace monorepo)

## How to run

The workflow **"Roulette Dealer Trainer"** starts the dev server automatically:

```
cd artifacts/roulette-trainer && pnpm install && PORT=5000 BASE_PATH=/ pnpm run dev
```

App is served at port 5000.

## Project structure

```
artifacts/roulette-trainer/src/
  App.tsx          # Root component and routing
  pages/           # Page-level components
  components/      # Reusable UI components (table, wheel, chips, bets…)
  hooks/           # Custom React hooks
  data/            # Static roulette data (number sequences, bet definitions)
  types/           # TypeScript types
  lib/             # Utility helpers
```

## User preferences

<!-- Add user preferences here as they are stated -->
