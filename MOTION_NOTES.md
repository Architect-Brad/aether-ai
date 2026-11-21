# AETHER Motion Layer — wiring notes (Phase 3)

Three new files, two touched packs. Nothing in `index.html`, `script.js`, `sw.js`,
`style.css`, or other `core/*.js` was modified.

## Tags to add in `index.html`

### 1. Stylesheet — in `<head>`, after the existing AETHER sheets

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="style-ivory.css">
<link rel="stylesheet" href="style-motion.css">
```

Insert `<link rel="stylesheet" href="style-motion.css">` **after** `style.css`
and `style-ivory.css` (currently lines 58–59), before the KaTeX stylesheet.
The file is additive; loading last lets its `@media (prefers-reduced-motion: reduce)`
overrides win without touching the original cascade.

### 2. Script — core-module block, immediately before `pack-loader.js`

```html
<script src="core/beast-mode.js"></script>
<script src="core/smooth-runtime.js"></script>
<script src="core/pack-loader.js"></script>
<script>if (window.AETHER_Packs) window.AETHER_Packs.autoLoad();</script>
```

Insert `<script src="core/smooth-runtime.js"></script>` **before**
`core/pack-loader.js` (currently line 1380) and therefore before the inline
`AETHER_Packs.autoLoad()` call. That guarantees `window.AETHER_Smooth` exists by
the time the packs are injected. Order is a performance win, not a hard
requirement: both packs feature-detect the global and fall back to their
original behavior if it is missing or loaded later.

The pack scripts themselves (`core/cognition-theater.js`,
`core/aether-composer-float.js`) are injected dynamically by `pack-loader.js`,
so they automatically load **after** the runtime with the order above. If any of
them is ever added as a static `<script src="core/...">` tag instead, place that
tag after `core/smooth-runtime.js` as well.

## What changed in the two packs

### `core/cognition-theater.js`
- Added a runtime feature-detect helper and split the old self-scheduling
  `loop()` into a schedule-free `frame(t)`, a `startLoop()` / `stopLoop()` pair,
  and a legacy `loop()` fallback.
- When `AETHER_Smooth` is present, frames come from its shared ticker via
  `pauseWhenVisible(#aether-wave, frame)`, so drawing stops when the wave is
  off-screen and the tab is hidden. `motionEnabled() === false` skips drawing.
- Theater is still off by default: with the runtime present, no subscriber is
  registered until `setEnabled(true)`; without it, the original parked
  `setTimeout`/rAF loop is preserved.
- `setEnabled()` now starts/stops the loop. `init()`, `destroy()`, and every
  public API method are unchanged; `destroy()` still tears down all timers,
  intervals, classes, and the overlay canvas (plus the new subscription).

### `core/aether-composer-float.js`
- Added `nextFrame()` (one-shot scheduling through the runtime's
  `throttleToFrame`, falling back to `requestAnimationFrame`/`setTimeout`) and a
  small `throttled(key, fn)` cache, reset on `destroy()`.
- `setMode()` scroll nudges now use `nextFrame()` instead of bare `rAF`.
- Drag preview and viewport-inset writes are coalesced to one per frame;
  pending previews are cancelled on pointer-up and on `destroy()`.
- `scrollChatToEnd()` uses instant scrolling when `motionEnabled() === false`.
- `init()`, `destroy()`, `setMode()`, `toggle()`, and all public API members
  remain intact, including the P1 listener teardown.
