---
name: Attestation settings editing
description: Durable rules for editing settings on an existing roulette attestation.
---

Existing attestation settings edits must use a local copy of the template config and persist only after explicit save. Saving updates the same template's config and updatedAt, while preserving its id, createdAt, game type, and all assignments.

**Why:** The attestation is a shared snapshot for its assigned dealers; live form edits must not leak into storage, and changing settings must not recreate or alter dealer assignments.

**How to apply:** Route edits separately from the read-only attestation page, initialize from the stored config rather than defaults, use the shared RouletteSettingsForm, discard the draft on cancel, and clone nested config data on save.