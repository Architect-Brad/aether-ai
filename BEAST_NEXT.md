# AETHER — Next Session War Plan
## Advanced sophistication · Defensible moat · Maximum coolness

**Status:** Wave 1–3 EXECUTED in v5.17 Neural OS (see changelog)  
**Baseline:** v5.17 Neural OS — Kernel, Council, Soul OS, Thread Graph, Ghost Commits, Theater, Boot, Themes  
**Doctrine:** Do not ship more beige chat features. Ship things Open WebUI / LibreChat / closed apps **cannot or will not** do as a zero-backend personal agent OS.

### Shipped (v5.17)
- S2 Kernel + flight recorder (`core/kernel.js`)
- S3 Soul OS chrome + patches + `/whoami` (`core/soul-os.js`)
- S4 Model Council MVP (`core/model-council.js`)
- S1 Thread Graph MVP (`core/thread-graph.js`)
- A1 Ghost commits (`core/ghost-commits.js`)
- A2 Cognition theater (`core/cognition-theater.js`)
- B1 Boot cinematic · B2 Theme packs
- Bridge: `core/advanced-bridge.js`

---

## North star (one sentence)

> AETHER is the **sovereign neural operating system** that lives in your browser — it sees your work, runs agents across models, remembers who you are, and *looks* like the future.

Every feature below must pass: **Does this deepen sovereignty, agency, memory, or spectacle?**  
If it only adds “another provider” or “another settings toggle,” kill it.

---

## Tier S — Moat builders (do these first)

### S1. **Neural Thread Graph** (conversation as a living organism)
**What:** Replace flat chat history with a spatial graph of threads, branches, agent runs, and research trees. Click a node → jump to that moment. Agent forks spawn child nodes. Deep Research produces a “investigation constellation.”

**Why moat:** Nobody’s open chat UI owns *beautiful multi-agent topology* client-side.  
**Cool factor:** Cyan constellation map, pulse on active generation, dual-context as parallel orbits.  
**Tech:** Canvas/WebGL or SVG + IndexedDB graph store; non-destructive (list view remains default).  
**Success:** User can branch a reply, run agent on branch B while chatting on A, see both in the graph.

### S2. **AETHER Kernel Mode** (local tool VM without a server)
**What:** A sandboxed in-browser “kernel” for agent tools:
- Virtual FS already exists → formalize syscalls: `read`, `write`, `exec` (Piston/Puter), `net` (hooks), `sense` (mic/OCR/location)
- Permission manifests per session (not per click spam)
- Replayable **tool transcripts** (“flight recorder”) for every agent run

**Why moat:** Turns Aether from “chat + tools” into an **OS with syscalls**.  
**Cool factor:** Kernel log panel: `SYSCALL open → WORKSPACE.md OK`, `NET tavily.search 240ms`.  
**Success:** Agent run produces a downloadable flight recorder JSON + pretty timeline UI.

### S3. **Soul OS** (identity as first-class runtime, not a viewer)
**What:** Elevate SOUL from a passive journal to a **live subsystem**:
- Always-on user model card in the chrome (editable, deletable, exportable)
- “What AETHER believes about you” with confidence scores
- Reflection writes **diffable soul patches** (git-style): `+ prefers terse code reviews`
- Multi-persona runtime: Nova/Cipher/etc. as **boot profiles** with different tool policies

**Why moat:** Closed apps hide personalization; self-hosted apps ignore it. Soul is *your* brand.  
**Cool factor:** Soul pulse on the wave; mood-tinted UI; `/whoami` slash command.  
**Success:** User edits soul → next response visibly changes style within 1 turn.

### S4. **Model Council** (multi-model deliberation, client-side)
**What:** One prompt → N providers in parallel (local + cloud) → discriminator pass → synthesis.
- Visual: split streams, then merge animation
- Beast Mode default: 2 specialists + 1 critic
- Cost/latency HUD per council seat

**Why moat:** Power users dream of this; almost nobody makes it *beautiful and local-first*.  
**Cool factor:** “Council chamber” UI — seats light up as tokens arrive.  
**Success:** Research question with 3 models produces cited synthesis better than any single seat alone (user-rated).

---

## Tier A — Sophistication spikes

### A1. **Workspace as Project Intelligence**
- Auto-build `AETHER.md` from linked folder (stack detect, scripts, TODOs)
- Semantic file map (not just list): clusters by language/module
- “Ghost commits” — agent proposes file diffs as cards; user Accept/Reject (Claude Code energy, browser-native)
- Watch mode: file change → proactive brief (“tests broke in auth.test.js”)

### A2. **Streaming Cognition Theater**
- Live CoT as a secondary wave channel (reason vs answer frequencies)
- Tool calls as orbiting glyphs around the main wave
- TTFT/TPS as optional “spectrometer” (still off by default)
- Beast Mode: full cognition theater on

### A3. **Private RAG that doesn’t suck**
- Chunk → BM25 + optional transformers.js embeddings (already in CDN path)
- Collections: Work / Research / Code with separate stores
- Cite-back chips in answers that jump to source chunk
- Honest limits UI (“personal library, not enterprise search”)

### A4. **Voice Presence**
- Call Mode → continuous voice agent with barge-in
- Local Whisper path first-class; cloud fallback
- “AETHER calls you” scheduled via SW periodicSync with soul-aware briefings

### A5. **Skill Runtime v2 (safe extensibility)**
- Local skill files (`skills/*.json` + optional wasm/js hook)
- Capability ACL: skill may use tools X,Y; never read keys
- Signed Architect skills + user opt-in unsigned skills (red warning)
- Skill marketplace later — **not** before sandbox

---

## Tier B — Coolness weapons (spectacle that sells the product)

| Weapon | Description | 30-second demo |
|--------|-------------|----------------|
| **B1. Boot cinematic** | Customizable boot sequence with system checks (providers, tools, soul, workspace) | Feels like a ship computer |
| **B2. Hex HUD theme pack** | 3 official skins: Void (default), Plasma, Monolith — CSS variables only | Instant aesthetic flex |
| **B3. Export Neural Report** | One-click branded PDF/MD of research + sources + soul snapshot | Shareable artifact |
| **B4. Time Travel scrubber** | Scrub conversation generation as if it were a video timeline | Unforgettable |
| **B5. Ambient mode** | Idle wave + soft TTS reflections from soul journal | Desktop art piece |

---

## Explicit non-goals (next session)

- ❌ Becoming multi-tenant SaaS  
- ❌ Docker-first “platform” pivot  
- ❌ Feature parity checklist with Open WebUI  
- ❌ Community skill free-for-all without sandbox  
- ❌ Growing `script.js` by another 5k lines without extraction  

---

## Execution order for next session

```
Wave 1 (foundation for cool features)
  1. Extract tools → core/tools/registry.js + domains (search, fs, comms)
  2. Flight recorder schema + agent timeline UI (S2 partial)
  3. Soul OS surface in chrome + /whoami + soul patches (S3 partial)

Wave 2 (the wow)
  4. Model Council MVP (2 seats + synthesis) (S4)
  5. Neural Thread Graph MVP (branch + visualize) (S1)
  6. Ghost commits for coding mode (A1)

Wave 3 (polish the myth)
  7. Cognition Theater on wave canvas (A2)
  8. Boot cinematic + theme pack (B1, B2)
  9. Demo script + landing GIF/video checklist
```

---

## Design constraints (non-negotiable)

1. **Zero backend remains sacred** — optional cloud is opt-in, never required  
2. **Zero build** until extraction forces `type="module"` (acceptable)  
3. **Every advanced feature degrades** — no crash if WebGL/ONNX/mic missing  
4. **Beast Mode is the showcase profile** — advanced features should *shine* when BEAST is on  
5. **Spectacle must serve cognition** — no pure eye-candy without a job  

---

## Competitive kill shots (messaging)

| They say | We ship |
|----------|---------|
| “Self-host ChatGPT” | “Own a neural OS” |
| “Plugins” | “Kernel syscalls + flight recorder” |
| “Memory” | “Soul with patches you can edit” |
| “Multi-model” | “Council with live deliberation” |
| “History” | “Thread graph of thought” |
| “Themes” | “Cognition theater” |

---

## Definition of done for “next level”

The product is next-level when a 90-second silent screen recording shows:

1. Boot cinematic → Beast online  
2. Council of 3 models answering in parallel → synthesis  
3. Agent run with flight recorder timeline  
4. Coding ghost-commit Accept on a real file  
5. Soul card updates live  
6. Thread graph showing the whole session as a constellation  

If that video doesn’t make a power user say *“what the fuck is that and how do I get it,”* we failed.

---

## Handoff notes for the agent (next session)

- Workspace: `/storage/self/primary/Project/Aether/aether-ai`
- Read first: `README.md`, `ARCHITECTURE.md`, `BEAST_NEXT.md`, `core/*`
- Do **not** re-do v5.16 packaging fixes unless regressions
- Prefer extracting before adding: tools + agent recorder before new modes
- Keep comments in AETHER voice; keep commits/docs clean
- When in doubt: **sovereignty > features > polish > novelty**

---

*Prepared after v5.16 Beast Mode. Next session: go advanced or go home.*
