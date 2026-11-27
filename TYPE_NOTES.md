# AETHER — Typography Sharpness Pass

**Files owned by this pass:** `style-type.css`, `TYPE_NOTES.md` (new, additive only).
No upstream file was edited. No dependencies added. No git write commands run.

## Exact `<link>` tag to add

Add **after** all existing stylesheets in `index.html` (must be last so it wins cascades):

```html
<link rel="stylesheet" href="style-type.css">
```

Load order:

1. `style.css`
2. `style-ivory.css`
3. `style-mobile.css`
4. `style-motion.css`
5. **`style-type.css`** ← new, last

> If `sw.js` precaches a stylesheet list, add `style-type.css` there too so offline loads get the same typography. (Out of scope for this pass — owned by another agent.)

## What changed

### 1. Font stack (`--font-mono`, `style.css:46`)
`Courier New` → modern cross-platform stack, same variable name:

```
ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace
```

Applied at `:root`. **Ivory is restored explicitly** (`html[data-aether-theme="ivory"]`, `html.theme-light`, `body.theme-light`) to the original `'Courier New', monospace`, so its typewriter-paper look is unchanged. Specificity of the restore (`0,1,1`) beats `:root` (`0,1,0`) without `!important`.

There is **no** `--font-sans` defined anywhere, and `--font-ui` is referenced (3 uses in `style.css`) but never defined. Nothing was renamed or invented — those cards keep inheriting the app font as before.

### 2. Crisp rendering — dark theme only
On `html:not([data-aether-theme="ivory"]):not(.theme-light)` (and `body`):

- `-webkit-font-smoothing: antialiased`
- `-moz-osx-font-smoothing: grayscale`
- `text-rendering: optimizeLegibility`

Both Ivory activation paths are excluded. This inherits into all dark-theme text.

### 3. No synthetic weights + no glow blur on readable copy
`font-synthesis: none` and `text-shadow: none` are applied **only** to chat/message/metric text: `.console-output`, `.aether-msg`, `.user-msg`, `.ap-status-text`, `.ap-sub-text`, `.ap-tps`, `.ap-latency`, `.cb-body code`, `.cb-line-nums span`. The scope selector outranks `.ap-status-text.thinking/.streaming/.success` without `!important`.

### 4. Small-screen tuning
- `≤820px`: message/code line-height `1.62`, letter-spacing `0.01em`, code `0.8rem` / `1.6`.
- `≤480px` (the 390px phone): message font-size floor `0.85rem` (up from `0.78rem`), line-height `1.65`, letter-spacing `0.012em`; `.ap-sub-text` / `.ap-status-text` `0.7rem`, `.ap-tps` / `.ap-latency` `0.66rem`.

All typography rules are dark-theme scoped, so Ivory keeps its authored sizes, line-heights, and `!important` `text-shadow: none` rules. Missing elements cost nothing (no `display`, no layout changes, no `!important`).

## Deliberately left alone

- **Decorative glow preserved:** `.splash-title`, `.logo-text` and `@keyframes glow-pulse`, `.sidebar-header h2`, `.modern-heading`, `.ob-brand`, `.quota-spent`, neon status indicators (`.status-state`, `.connection-indicator`, `.tps-indicator`, `.latency-indicator`), all buttons (`.cmd-btn` etc.), `.aether-msg a:hover`, `.cursor-blink`, `.soul-modal-title`, `.modal-*` titles. These are intentional spectacle.
- **Ivory theme:** all 9 `text-shadow: none !important` rules in `style-ivory.css`, its variable overrides, and its original font stack — untouched. We never fight them.
- **No global `text-shadow: none !important`**, no `!important` at all in `style-type.css`.
- **CRT scanline overlay** left as-is (atmosphere, not typography).
- No JS, HTML, SW, or other CSS files edited.

## Risks / caveats

- **`antialiased` can look thin on some Android screens** (AMOLED / low pixel density). It removes subpixel color fringing but also removes the extra stroke weight some users perceive as "bold". If it reads too light, change only the `-webkit-font-smoothing` value to `auto` for those devices — do not remove the rest.
- **`text-rendering: optimizeLegibility`** enables ligatures/kerning; with monospace this is usually invisible, but a rare font fallback could alter spacing slightly. Harmless if the linked font is missing.
- **`font-synthesis: none`** disables *fake* bold and *fake* italic. If a fallback font lacks a real italic face, italic code comments (`/* ... */` styled italic upstream) may render upright. Bold headings were deliberately excluded from this rule so they keep their weight.
- **`.ap-*` meta text** now has no cyan glow and a slightly larger size; on very narrow screens the status line may ellipsize sooner. This is acceptable — the previous glow made it unreadable at `0.56rem`.
- **Variable restore caveat:** `body.theme-light` is supported by `style-ivory.css` but the JS theme check only looks at `html`. The font restore covers both; the dark-theme typography scope excludes the `html` paths only. In practice the app only uses the `html` paths.
