---
name: Workspace build ports
description: Environment-specific build requirement for the mockup sandbox package.
---

The workspace-wide build can fail in `mockup-sandbox` when its Vite config is invoked without a `PORT` environment variable. The Roulette Trainer package can still be typechecked and built independently.

**Why:** The sandbox Vite configuration validates its runtime port during config loading, even for a standalone production build.

**How to apply:** When validating Roulette Trainer changes, run its package build separately if the workspace build stops at mockup-sandbox; do not change unrelated app code to work around this.