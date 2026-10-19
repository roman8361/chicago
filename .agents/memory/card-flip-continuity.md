---
name: Card flip continuity
description: User-approved behavior for moving between Russian Poker deals.
---

When advancing to the next deal, smoothly close the current hand before replacing its cards, then reveal the new hand with the same flip behavior used by Start. Never snap an open hand directly to its closed position.

**Why:** The user reported that Start in the older version does not make the cards jump and asked for Next to behave the same way.

**How to apply:** Preserve the close → replace while facedown → reveal sequence when changing card-table transitions.
