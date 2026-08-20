---
name: Three-complete generation
description: Invariants for generating three number completes while preserving existing one- and two-complete behavior.
---

When three number completes are enabled, the first two retain the existing pair constraints and define the mandatory winning intersection. The third must be chosen only after the winning number is known, using physical expanded positions rather than its center number, so it cannot touch the winning number. If multiple active series exist, prefer safe third-complete candidates whose center belongs to a losing series; otherwise use any safe candidate. Play-unit values should be distinct when available, but duplicates are allowed when the configured range cannot provide a third unique value.

**Why:** A complete’s real split, street, corner, or six-line positions can win even when its center number does not, so selecting the third complete only by center number can violate the losing invariant.

**How to apply:** Keep one- and two-complete paths unchanged. For three completes, derive the draw from the first pair, then replace/select the third against the final winning number; retry the round if no physically safe candidate exists.