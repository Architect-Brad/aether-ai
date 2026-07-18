# AETHER Neural Interface v5.36 — Agent Closure

**Open-source. Local-first. Zero backend.**

Browser-native **neural operating system** with a competitive agent + coding shell. Zero build step. GPL-3.0.

> *Tool→model continue · Tool Runtime v2 · Ghost reliability · `/rag index` · `/shipcheck` · Moat provenance.*

## Quick start

```bash
# From this directory
python3 -m http.server 3000
# open http://localhost:3000
```

Or double-click `index.html` (some STT/PWA features need localhost/HTTPS).

## Hero modes

| Mode | What it does |
|------|----------------|
| **AGENT** | Multi-step tool use + **tool→model continue loop** |
| **CODE** | Code Pro: git · swarm · PR · packs · Ghost · `fs_patch` |
| **DEEP** | Deep Research v3 pipeline |
| **WS** | Workspace memory (FS or virtual) |
| **BEAST** | Max autonomy profile |
| **COUNCIL** | Multi-model deliberation + synthesis |
| **GRAPH** | Neural thread constellation |
| **SETUP** | Provider + API key / local endpoint |

## Flagship systems (v5.30–5.36)

| System | Slash / surface |
|--------|------------------|
| Tool Runtime v2 | native `tool_calls`, envelopes, retry, `/tools health` |
| Agent Closure | auto re-entry after tools (depth 3–4) |
| Ghost Commits | re-read / conflict / verify on Accept |
| RAG v2 | hybrid BM25+vector · `/rag index` folder walk |
| Ship gate | `/shipcheck` · `node scripts/shipcheck.mjs` |
| Markdown GFM | `/mdtest` fixtures |
| Skill Runtime | playbooks + policy modes |
| Moat | provenance score + session record |
| Kernel | flight recorder |

### Slash highlights

`/shipcheck` `/rag index` `/rag search <q>` `/tools health` `/tooltest` `/mdtest` `/golden` `/moat` `/ghost` `/version` `/beast` `/whoami`

## Architecture

```
aether-ai/
├── index.html + script.js + style.css
├── sw.js · manifest.json · logo.svg
├── core/                 # zero-build modules
│   ├── version.js        # single version source of truth
│   ├── aether-tool-runtime.js
│   ├── aether-markdown.js
│   ├── aether-rag-v2.js
│   ├── ghost-commits.js
│   ├── aether-ship.js
│   └── …
├── scripts/shipcheck.mjs # headless CI golden suite
└── tests/                # smoke · golden-paths · md-golden
```

## Smoke / CI

```bash
# Headless (CI)
node scripts/shipcheck.mjs

# Browser
python3 -m http.server 3000
# open http://localhost:3000/tests/smoke.html
# open http://localhost:3000/tests/md-golden.html
```

## Security notes

- API keys can be AES-256-GCM encrypted at rest (PBKDF2 100k).
- `calculate` does **not** use `eval`.
- Path traversal blocked; shell allowlisted; MCP localhost-only; SSRF guard on private HTTP.
- Beast Mode skips coding-mode destructive tool confirmation — only enable when you trust the session.
- This is a browser app: XSS still equals full access to in-memory secrets.

## Contributing

See `CONTRIBUTING.md`. License: GPL-3.0-or-later.
