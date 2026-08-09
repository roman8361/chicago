---
name: Attestation deletion
description: Durable rules for physically deleting an existing roulette attestation from local storage.
---

Deleting an attestation must remove only assignments whose `trainingTemplateId` matches the selected template, then remove that template itself. Dealer records and assignments belonging to other templates must remain.

**Why:** A dealer can participate in multiple attestations; deleting by dealer ID would remove unrelated relationships.

**How to apply:** Require an explicit confirmation, guard against duplicate confirmation clicks, perform the two storage operations through the storage module, and navigate to the attestations list so it rereads storage.