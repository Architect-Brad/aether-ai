# AETHER — Mobile Pass notes

Phase 2 deliverables. Layout/contrast only — **no text content was changed** in any file.

## Files created

- `style-mobile.css` — all rules scoped to `@media (max-width: 820px)` and `@media (max-width: 480px)`
- `core/mobile-ui.js` — classic-script IIFE, `window.AETHER_MobileUI`, self-inits on `DOMContentLoaded`
- `MOBILE_NOTES.md` — this file

## Wire into `index.html`

### 1. Stylesheet — after `style-ivory.css`, before the KaTeX CSS

In `<head>`, directly after this existing line:

```html
<link rel="stylesheet" href="style-ivory.css">
```

add exactly:

```html
<link rel="stylesheet" href="style-mobile.css">
```

Load order matters: mobile rules must come after both `style.css` and `style-ivory.css` so they win the cascade. Self-contained — no build step, no imports.

### 2. Script — in the core module block, just before `script.js`

Near the bottom of `index.html`, the core scripts run from `core/version.js` through `core/advanced-bridge.js`, then `<script defer src="script.js"></script>`. Add exactly:

```html
<script src="core/mobile-ui.js"></script>
```

immediately **before** the `script.js` line (e.g. right after `core/aether-code-mobile.js` / `core/themes.js` is fine — anywhere in that block works). The script self-inits on `DOMContentLoaded`, so it has no dependency on `script.js` globals. Adding `defer` is also safe and consistent with its neighbours:

```html
<script defer src="core/mobile-ui.js"></script>
```

Either form is fine; the IIFE handles both.

## Expected hooks

**No new hooks are required from `script.js`.** Everything keys off existing markup:

| Hook | Used for |
|---|---|
| `.status-bar`, `.status-right` | header collapse; JS appends the `⋯` toggle here |
| `#status-model-pill`, `#status-model-name` | model-name ellipsis / max-width |
| `.workspace-status`, `#workspace-path` | contrast + compact path |
| `.ap-status-text`, `.ap-sub-text` | "BEAST MODE STANDBY" / subtext contrast |
| `.control-sector`, `.control-core`, `.control-hero`, `.control-advanced`, `.cmd-btn` | 44px targets, 3-up grid |
| `.aether-msg` (welcome card is `.aether-msg.fade-in`) | line wrapping / paragraph spacing |
| `#aether-kernel-panel`, `.kernel-panel-hdr`, `.kernel-btn`, `.kernel-ev`, `.kev-ms` | kernel compactness |
| `.splash-subtitle` | subtitle sizing so `·` never dangles |

## State classes JS adds

- `html.mobile-ui`, `body.mobile-ui` — viewport ≤ 820px
- `html.mobile-ui-compact`, `body.mobile-ui-compact` — viewport ≤ 480px
- `html.mobile-header-expanded` — toggled by the injected `#mobile-header-toggle` (`⋯`) button; reveals the hidden logo/version/dividers/calendar/reflection dot
- `button#mobile-header-toggle.mobile-header-toggle` — created at runtime; `aria-expanded` kept in sync

`window.AETHER_MobileUI.refresh()` is public — call it after any layout-changing UI action if you want the toggle/classes re-evaluated immediately. It is also called automatically on `resize` / `orientationchange`.

## Degradation safety

- CSS is pure media queries; if an element is missing, the rule simply never matches.
- JS guards every DOM lookup, `matchMedia`, `requestAnimationFrame`, `appendChild`, and `classList`.
- Ivory theme is excluded from all contrast overrides via `html:not([data-aether-theme="ivory"])`; text-shadow rules in `style-ivory.css` stay `!important` and intact.
- No animation/transition declarations were added or removed — the mobile file adds none.

## Deliberately NOT fixed

- **Welcome-card copy** in `script.js` `showWelcomeMessage()` (~line 13209) — maintainer owns this. Current copy contains `&nbsp;` sequences that resist wrapping until the copy changes; CSS wrapping is improved but those hard spaces still win.
- **Splash subtitle text assignment** in `index.html` (~line 1421, `\u00A0·\u00A0`) — left alone; CSS sizing keeps it on one line instead.
- **`sw.js` precache list** — out of scope (read-only). Maintainer should add `./style-mobile.css` and `./core/mobile-ui.js` to `CORE_ASSETS` and bump `CACHE_VERSION` so the mobile pass works offline.
- No changes to `index.html`, `script.js`, `style.css`, `style-ivory.css`, `sw.js`, or any existing `core/*.js`.
