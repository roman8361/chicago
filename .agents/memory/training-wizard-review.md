---
name: Training wizard review
description: Durable rules for the manager's pre-creation attestation review step.
---

The manager review screen is read-only: it presents the same `GameSettings` object used by the settings form and resolves selected dealer names from the shared dealer source using `dealerIds`. It must not create Training, TrainingTemplate, TrainingAssignment, or GeneratedSpin records.

**Why:** The review is a confirmation step before the later persistence stage; duplicating settings or dealer names would allow the summary to drift from the wizard.

**How to apply:** Preserve wizard state when navigating between review, game selection, settings, and dealer selection. Reset the wizard only on cancellation. If the game type truly changes, replace the prior game's config with defaults rather than reusing it.