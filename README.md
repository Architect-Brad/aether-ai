# AETHER Neural Interface v5.39 — Viz v2

**Open-source. Local-first. Zero backend.**

Browser-native **neural operating system** with agent tools, CODE/Ghost, RAG, and AetherViz. Zero build step. GPL-3.0.

> *Tool continue · Ghost · `/rag index` · Viz v2 · Composer Float · `/heropath` · `/shipcheck`*

## Quick start

```bash
# From this directory
python3 -m http.server 3000
# open http://localhost:3000
```

Or open `index.html` (some STT/PWA features need localhost/HTTPS).

---

## 90-second hero path (the demo that matters)

Cold visitor. No Docker. Goal: **trust the agent on your files**.

| # | Step | What you do |
|---|------|-------------|
| 1 | **SETUP** | MODES → SETUP · Local (Ollama) **or** paste a free OpenRouter / Groq / Google key · Save |
| 2 | **CODE + folder** | Toggle **CODE** · **Link Folder** · pick any project |
| 3 | **Ghost edit** | Chat: *Add a one-line comment to README.md* · **Accept** the Ghost patch |
| 4 | **RAG index** | `/rag index` · then `/rag search <keyword from your project>` |
| 5 | **Viz or gate** | Ask for a chart with a `viz` fence · or run `/shipcheck` |

In the app, run **`/heropath`** anytime for a live checklist (hard modules + session state).

Browser smoke page: [tests/hero-path.html](tests/hero-path.html)

---

## Hero modes

| Mode | What it does |
|------|----------------|
| **AGENT** | Multi-step tool use + tool→model continue |
| **CODE** | Code Pro: Ghost · `fs_patch` · folder · PR set |
| **DEEP** | Deep Research v3 |
| **WS** | Workspace memory |
| **BEAST** | Max autonomy |
| **COUNCIL** | Multi-model deliberation |
| **GRAPH** | Thread constellation |
| **SETUP** | Provider + key / local endpoint |

## Flagship systems

| System | Slash / surface |
|--------|------------------|
| Tool Runtime v2 | native `tool_calls`, `/tools health` |
| Agent Closure | re-entry after tools (depth 3–4) |
| Ghost Commits | re-read · conflict · verify on Accept |
| RAG v2 | `/rag index` · hybrid search |
| AetherViz v2 | multi-spec · `/viztest` |
| Ship / hero | `/shipcheck` · `/heropath` |
| Composer Float | drag raise/dock input |
| Moat | provenance score |

### Slash highlights

`/heropath` `/shipcheck` `/rag index` `/rag search` `/viztest` `/mdtest` `/tooltest` `/golden` `/moat` `/ghost` `/version`

## Architecture

```
aether-ai/
├── index.html + script.js + style.css
├── sw.js · manifest.json
├── core/                 # zero-build modules
│   ├── version.js
│   ├── aether-tool-runtime.js
│   ├── aether-visualizer.js
│   ├── aether-rag-v2.js
│   ├── ghost-commits.js
│   ├── aether-ship.js    # golden + hero path + shipcheck
│   └── …
├── scripts/shipcheck.mjs
└── tests/                # smoke · hero-path · md-golden · viz-golden
```

## Smoke / CI

```bash
# Headless
node scripts/shipcheck.mjs

# Browser
python3 -m http.server 3000
# http://localhost:3000/tests/smoke.html
# http://localhost:3000/tests/hero-path.html
# http://localhost:3000/tests/viz-golden.html
```

## Security notes

- API keys can be AES-256-GCM encrypted at rest.
- `calculate` does **not** use `eval`.
- Path traversal blocked; shell allowlisted; MCP localhost-only.
- **Never** ship shared provider keys in the client — BYOK only.
- Beast Mode relaxes destructive gates — only when you trust the session.

## Contributing

See `CONTRIBUTING.md`. License: GPL-3.0-or-later.
