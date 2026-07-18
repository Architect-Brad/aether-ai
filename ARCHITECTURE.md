# AETHER Architecture (v5.16 Beast Mode)

## Thesis

AETHER is a **browser-native agent OS**: multi-provider chat, tools, workspace memory, speech, and agent loops — with **no application backend**. The browser *is* the runtime.

## Runtime layers

```
┌─────────────────────────────────────────────┐
│  UI shell (index.html + style.css)          │
│  splash · sidebar · hero toolbar · modals   │
├─────────────────────────────────────────────┤
│  core/*  (version, math, caps, beast)       │
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

## Data flow (chat)

1. User input → `sendMessage()`
2. Build system prompt (`buildSystemPrompt`) + persona + workspace manifest + RAG + Beast addon
3. Provider-specific request body / auth via `buildAuthHeaders`
4. Stream tokens → markdown renderer → tool parse (`[[tool]]` / XML)
5. `callTool` → `TOOL_REGISTRY` → results re-injected for agent loops
6. Persist conversation + optional workspace logs

## Beast Mode

`core/beast-mode.js` toggles a **profile**, not a separate engine:

- Research defaults → exhaustive / comprehensive / critical  
- `state.beastMode = true`  
- System prompt bias toward tool use and completion  
- Coding destructive-tool permission gate skipped  
- UI chrome (`html.beast-mode`, badge, button pulse)

## Modularisation plan

| Phase | Goal |
|-------|------|
| **Done (5.16)** | `core/version`, `safe-math`, `capabilities`, `beast-mode` |
| Next | Extract `TOOL_REGISTRY` domains to `core/tools/*.js` |
| Next | Extract markdown + streaming to `core/render/` |
| Later | Convert main entry to `type="module"` once globals are eliminated |

Constraint: **no bundler**. Prefer classic scripts → then ES modules.

## Security model

| Asset | Protection |
|-------|------------|
| API keys at rest | Optional AES-256-GCM + PBKDF2 |
| API keys in use | Session memory only |
| Math tool | Restricted evaluator / mathjs (no eval) |
| Skills | Architect-authored only |
| XSS | Classic browser app risk — treat as trusted origin |

## Competitors (positioning)

| Class | Examples | AETHER stance |
|-------|----------|---------------|
| Self-hosted platforms | Open WebUI, LibreChat | They win multi-user ops; we win zero-backend sovereignty |
| Thin chat UIs | Chatbot UI | We win agent/tool density |
| Closed apps | ChatGPT/Claude apps | We win bring-your-own-model + local |

North star: **personal agent shell**, not enterprise chat platform.

## Key files by concern

| Concern | File |
|---------|------|
| Version | `core/version.js` |
| Providers / auth | `script.js` SECTION 9 + `PROVIDER_REGISTRY` |
| Tools | `TOOL_REGISTRY` ~SECTION 16 |
| Agent | SECTION 18 |
| Streaming | SECTION 17 / `sendMessage` |
| SOUL | SECTION 19 |
| SW cache | `sw.js` |

— Maintained with the Beast Mode consolidation release.
