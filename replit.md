# Roulette Dealer Trainer

A React/Vite app that simulates a European roulette table for dealer training. Features include a full betting layout, racetrack (announced bets), configurable limits, and a debug screen.

## Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui
- **Routing:** Wouter
- **State:** React context + local state
- **Monorepo:** pnpm workspaces

## Project structure
```
artifacts/
  roulette-trainer/   ← main web app (served on port 5000)
  api-server/         ← Express API server (optional)
  mockup-sandbox/     ← design/component preview sandbox
```

## How to run
The **Roulette Dealer Trainer** workflow starts the app:
```
cd artifacts/roulette-trainer && pnpm install && PORT=5000 BASE_PATH=/ pnpm run dev
```
App is served at `http://localhost:5000`.

## User preferences
- UI language: Russian (interface labels in Russian)
