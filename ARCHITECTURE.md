# AETHER Architecture (v5.40 Hero Path)

## Thesis

AETHER is a **browser-native agent OS**: multi-provider chat, tools, workspace memory,
speech, and agent loops — with **no application backend by default**. The browser *is*
the runtime. Cloud auth/sync is optional and opt-in (see "Persistence" below).

## Runtime layers

```
┌─────────────────────────────────────────────┐
│  UI shell (index.html + style.css)          │
│  splash · sidebar · hero toolbar · modals   │
├─────────────────────────────────────────────┤
│  core/*  (version, utils, math, caps, beast)│
├─────────────────────────────────────────────┤
│  script.js  — application brain             │
│  state · providers · tools · stream · soul  │
│  coding · research · agent · RAG · UI wire  │
├─────────────────────────────────────────────┤
│  Skills (discovery, documents, AETHER_SKILLS)│
├─────────────────────────────────────────────┤
│  Persistence: localStorage / IndexedDB      │
│  Optional: File System Access API, Firebase │
├─────────────────────────────────────────────┤
│  PWA: sw.js + manifest.json                 │
├─────────────────────────────────────────────┤
│  External: model APIs + hook APIs + CDNs    │
└─────────────────────────────────────────────┘
```

All `core/*` scripts and `script.js` load as classic `<script defer>` IIFEs that attach
to `window`/`globalThis`; there is no bundler and no `type="module"` entry today.

## Data flow (chat)

1. User input → `sendMessage()`
2. Build system prompt (`buildSystemPrompt`) + persona + workspace manifest + RAG + Beast addon
3. Provider-specific request body / auth via `buildAuthHeaders`
4. Stream tokens → markdown renderer → tool parse (native `tool_calls`, with `[[tool]]` / XML fallback)
5. `callTool` → `TOOL_REGISTRY` → results re-injected for agent loops (depth 3–4)
6. Persist conversation + optional workspace logs

## Beast Mode

`core/beast-mode.js` toggles a **profile**, not a separate engine:

- Research defaults → exhaustive / comprehensive / critical
- `state.beastMode = true`
- System prompt bias toward tool use and completion
- Coding destructive-tool permission gate bypassed
- UI chrome (`html.beast-mode`, badge, button pulse)

## Modularisation roadmap (future work unless marked Done)

| Status | Goal |
|--------|------|
| **Done (v5.16)** | `core/version.js`, `safe-math.js`, `capabilities.js`, `beast-mode.js` |
| **Done (v5.40)** | `core/utils.js` — canonical `esc`/`uid`/shared constants, consumed by `script.js` |
| **Future** | Extract `TOOL_REGISTRY` domains to `core/tools/*.js` |
| **Future** | Extract markdown + streaming to `core/render/` |
| **Future (later)** | Convert the main entry to `type="module"` once globals are eliminated |

Everything below "Done" is a **plan, not shipped behaviour**. The shipped entry remains
classic scripts with globals: prefer classic scripts → ES modules only when the globals
are gone. No bundler is planned for the core runtime.

## Security model

| Asset | Protection |
|-------|------------|
| API keys at rest | Optional AES-256-GCM + PBKDF2 (session passphrase in memory; keys encrypted on save, unlocked on load) |
| API keys in use | Session memory only |
| Math tool | Restricted evaluator / mathjs (no `eval`) |
| Skills | Architect-authored only |
| XSS | Classic browser app risk — treat as trusted origin |

## Key files by concern

| Concern | File |
|---------|------|
| Version | `core/version.js` |
| Providers / auth | `script.js` SECTION 9 + `PROVIDER_REGISTRY` |
| Tools | `TOOL_REGISTRY` SECTION 16 |
| Agent | SECTION 18 |
| Streaming | SECTION 17 / `sendMessage` |
| SOUL | SECTION 19 |
| SW cache | `sw.js` |

— Aligned with v5.40 Hero Path. Version source of truth: `core/version.js`.
