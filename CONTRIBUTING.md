# Contributing to AETHER

Thanks for helping make the neural interface sharper.

## Ground rules

1. **Zero build step** for the main app — no Vite/Webpack/npm for core runtime files.
2. **No new hard dependencies** in the critical path. Optional CDN features must degrade gracefully.
3. **Mobile-first** — UI must work at 375px width.
4. **GPL-3.0-or-later** — contributions under the same license.
5. **Do not grow `script.js` blindly** — extract into `core/` or skill modules.

## Where to put code

| Change | Location |
|--------|----------|
| Version / build metadata | `core/version.js` only |
| Safe utilities (math, crypto helpers) | `core/*.js` |
| New external capability skill | `*-skill.js` (ES module pattern like discovery/documents) |
| New tool | Register in `TOOL_REGISTRY` in `script.js` (until tools are extracted) |
| UI shell / modals | `index.html` + `style.css` |
| Service worker cache list | `sw.js` `CORE_ASSETS` |

### Adding a tool (3 steps)

1. Implement the function (or call an existing API helper).
2. Register on `TOOL_REGISTRY` with `{ fn, desc }`.
3. Mention it in the system prompt builder (`buildSystemPrompt`) if the model should know it exists.

### Adding a `core/` module

```html
<script src="core/your-module.js"></script>
```

- IIFE attaching to `window` / `globalThis` (matches current non-module `script.js`).
- Add the path to `sw.js` `CORE_ASSETS`.
- Add a smoke assertion in `tests/smoke.html` when behaviour is pure/testable.

## Version bumps

1. Edit **only** `core/version.js` (`VERSION`, `CODENAME`, `BUILD`).
2. Bump `manifest.json` `"version"`.
3. Bump `sw.js` `CACHE_VERSION` to force clients to refresh.
4. Add a changelog entry in `AETHER_CHANGELOG` inside `script.js`.

Do not hardcode `v5.xx` in new UI strings — read `AETHER_VERSION_LABEL`.

## Testing

```bash
python3 -m http.server 3000
open http://localhost:3000/tests/smoke.html
```

Minimum before a PR:

- [ ] Smoke tests all green  
- [ ] Manual: send a chat with a mock/local endpoint  
- [ ] Manual: toggle Beast Mode; confirm badge + notification  
- [ ] Console clean of new errors on load  

## Code style

- Vanilla JS, ES2020-ish, no TypeScript in core (yet).
- Prefer clear comments over clever abstractions.
- Match existing cyberpunk UI tokens (`--neon-cyan`, mono fonts).
- Keep sarcasm in comments optional; keep clarity mandatory.

## Security

- Never commit API keys.
- Never reintroduce `eval` / `new Function` for user or model-controlled input.
- Skills that inject system prompts are Architect-reviewed only until a sandbox exists.

## PR hygiene

- One concern per PR when possible.
- Describe *why*, not only *what*.
- Screenshots for UI changes.

— The Architect
