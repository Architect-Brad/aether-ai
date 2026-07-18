# AETHER Neural Interface v5.27 — Aether Code Pro

**Open-source. Local-first. No compromises.**

Browser-native **neural operating system** with a competitive **terminal-agent coding shell**. Zero backend. Zero build step. GPL-3.0.

> *Toggle CODE — RAG v2 hybrid retrieve, tool runtime, MCP import, mobile tabs, Ghost, `fs_patch`.*

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
| **AGENT** | Multi-step autonomous tool use |
| **CODE** | Code Pro (desktop + **mobile tabs**): git · swarm · PR · packs · Ghost · `fs_patch` |
| **DEEP** | Configurable deep research pipeline |
| **WS** | Workspace memory (FS or virtual) |
| **BEAST** | Max autonomy — exhaustive research, direct FS writes, action-biased prompts |
| **COUNCIL** | Multi-model parallel deliberation + synthesis |
| **GRAPH** | Neural thread constellation |
| **SETUP** | Provider + API key / local endpoint |

Secondary tools under **MORE**: KERNEL (flight recorder), THEATER, THEME, Call, SOUL, Skills, RAG, …

### Neural OS slash commands
`/whoami` `/council` `/kernel` `/graph` `/theme` `/theater` `/ghost` `/beast` `/version`

## Architecture (honest)

```
aether-ai/
├── index.html              UI shell + modals
├── script.js               Main app (~19k lines — being modularised)
├── style.css               Design system
├── sw.js                   Service worker (offline / PWA)
├── manifest.json           PWA manifest
├── logo.svg                App icon
├── core/                   Zero-build modules (load before script.js)
│   ├── version.js          Single version source of truth
│   ├── safe-math.js        calculate tool without eval()
│   ├── capabilities.js     CDN probe + degraded-mode banner
│   └── beast-mode.js       Beast Mode profile
├── discovery-skill.js      Search / maps / weather skill
├── documents-supremacy.js  Office document skill
└── tests/smoke.html        Critical-path smoke tests
```

**Not zero-dependency:** optional CDN libs (KaTeX, highlight.js, ONNX, Mermaid, …) enhance the UI. Core chat works if they fail; a capability banner reports what’s missing.

## Smoke tests

```bash
python3 -m http.server 3000
# open http://localhost:3000/tests/smoke.html
```

## Slash commands

- `/version` — build + provider/tool counts  
- `/beast` — toggle Beast Mode  
- `/soul` — open self-model viewer  
- `/settings` — SETUP  

## Security notes

- API keys can be AES-256-GCM encrypted at rest (PBKDF2 100k).  
- `calculate` does **not** use `eval`.  
- Beast Mode skips coding-mode destructive tool confirmation — only enable when you trust the session.  
- This is a browser app: XSS still equals full access to in-memory secrets.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Keep the zero-build ethos. Prefer new code in `core/` or skill files over growing `script.js` forever.

## License

GPL-3.0-or-later · Copyright (C) 2026 The Architect
