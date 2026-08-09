---
name: Attestation persistence
description: Durable data model rules for saved manager attestations.
---

Saved attestations use separate localStorage collections for `TrainingTemplate` and `TrainingAssignment`. One template stores the cloned game config; each selected dealer gets an assignment referencing that template. Dealer names are resolved from the shared dealer storage at display time.

**Why:** A single shared template prevents identical settings from being copied once per dealer and keeps the model ready for a future backend migration.

**How to apply:** Compute dealer counts from assignments, preserve orphaned assignments as `Дилер удалён`, and keep the current Roulette spin/game logic separate from this manager persistence flow.