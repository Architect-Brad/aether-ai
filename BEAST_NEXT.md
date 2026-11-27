# AETHER v5.17 "Neural OS" — historical note

> **Historical record only.** Current release is **v5.40 Hero Path** (`core/version.js`).
> The in-app changelog (`AETHER_CHANGELOG` in `script.js`) is authoritative for what shipped.
> This file was once a forward-looking "next session war plan". Its unexecuted waves,
> execution orders, and positioning copy were removed: they contradicted the shipped
> record and duplicated the website.

## What shipped in v5.17

Verified against the `AETHER_CHANGELOG` v5.17 entry ("Neural OS — Kernel, Council, Soul,
Graph, Ghost") and the `core/` modules present in this repo:

| Feature | Module | Shipped behaviour |
|---------|--------|-------------------|
| Kernel + flight recorder | `core/kernel.js` | syscall flight recorder for every tool call; exportable JSON timeline |
| Model Council | `core/model-council.js` | parallel multi-seat deliberation + speaker synthesis (`COUNCIL` / `/council`) |
| Soul OS | `core/soul-os.js` | live chrome chip, soul patches, `/whoami`, system-prompt injection |
| Neural Thread Graph | `core/thread-graph.js` | constellation map of message / agent / research / council nodes |
| Ghost Commits | `core/ghost-commits.js` | Accept/Reject file writes in coding mode (Beast writes direct) |
| Cognition Theater | `core/cognition-theater.js` | reasoning wave channel + orbiting tool glyphs |
| Boot cinematic | `core/boot-cinematic.js` | ship-computer system checks on session start |
| Hex HUD themes | `core/themes.js` | Void / Plasma / Monolith (`/theme`) |

The release also registered the slash pack `/whoami /council /kernel /graph /theme /theater /ghost`;
all are still present in `script.js`.

No roadmap lives here now. See `README.md` for the current product and `CONTRIBUTING.md`
for contribution rules.
