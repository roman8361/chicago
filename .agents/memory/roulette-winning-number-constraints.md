---
name: Roulette winning-number constraints
description: Durable rule for choosing the winning number when series, neighbour bets, and completes coexist.
---

The winning number must be selected from one strict intersection of every active mandatory coverage set:

- the union of numbers covered by all active series;
- the union of numbers covered by all active neighbour bets;
- the allowed coverage of active completes.

When both series and neighbours are present, neither source may be selected independently or used as a fallback after the intersection becomes empty. A selected number may win multiple series and multiple neighbour bets naturally.

**Why:** Choosing a primary series or falling back to one source can produce rounds where the other active bet type loses, violating the minimum-win rule.

**How to apply:** Generate/retry the linked bets or the complete round with a bounded attempt count until the strict intersection is non-empty; only then choose the random winning number.