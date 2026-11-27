# AETHER — Rendering Resilience notes

Owner scope: **rendering resilience only**. Only `style-resilience.css` and this
file were created. `index.html`, `sw.js`, all existing stylesheets and all JS
were **read but not edited**. No git write commands were run.

## Exact `<link>` tag and load order

Insert one line in `index.html` immediately **after** line 63
(`<link rel="stylesheet" href="style-anim.css">`) and **before** the KaTeX link:

```html
    <link rel="stylesheet" href="style-resilience.css">
```

Resulting AETHER stylesheet order (the new line is last):

1. `style.css`
2. `style-ivory.css`
3. `style-mobile.css`
4. `style-motion.css`
5. `style-type.css`
6. `style-anim.css`
7. **`style-resilience.css`** ← new
8. (third-party) KaTeX CSS, loaded async with `media="print" onload="this.media='all'"`

Why last: every override here relies on source order rather than `!important`.
At equal specificity our declarations win over `style.css`, `style-anim.css`
and the 820px variable block; theme-specific `!important` rules are left alone.

## Selector list and why each was chosen

### 1. `content-visibility: auto` + `contain-intrinsic-size`

All six groups use the same two-step declaration pattern:

```css
contain-intrinsic-size: none <height>;              /* fallback */
contain-intrinsic-size: auto none auto <height>;    /* remembers real size */
```

The inline axis is deliberately `none` so offscreen flex/grid children keep
following normal width resolution; only the block axis gets a placeholder.
Browsers without `auto <length>` keep the plain fallback.

| Selector | Placeholder | Evidence in the codebase |
| --- | --- | --- |
| `.conversation-item` | 56px | Built in `renderConversationList()` (script.js ~13973). `.conversation-title` is `white-space: nowrap` + ellipsis, so rows are near-constant height (10px padding ×2 + two text lines + border + 6px margin). |
| `.aether-msg`, `.user-msg` | 96px | The two message bubbles created throughout script.js and `core/aether-subagents.js`; long chat history is the primary scroll list. |
| `.tool-result-msg`, `.code-tool-inline` | 140px | `renderToolResultCard()` puts up to 4000 chars in `.code-tool-inline-body`; a taller estimate avoids a large first-reveal jump. These are `.aether-msg` subclasses and intentionally come after the generic rule. |
| `.code-tool-card` | 64px | `pushCodeToolCard()` caps `#code-tool-timeline` at 40 cards; card body previews are short. |
| `.kernel-timeline` | 120px | `core/kernel.js` caps `.kernel-ev` rows at 80 and gives the scroller `max-height: 34vh; overflow: auto`; the panel is `display:none` when collapsed, so containment is a no-op then. |
| `.skill-card` | 160px | Built in script.js ~19491 inside `.skills-grid` (`overflow-y: auto; max-height: 420px`); header, description, prompt preview, tool tags and footer make ~150–170px rows. |

### 2. `contain: layout paint style` on self-contained panels

`size` and `strict` were deliberately avoided: all five panels must size from
their content. Markup was checked for escaping children first:

| Selector | Why safe |
| --- | --- |
| `.sidebar` | Flex column of `.sidebar-header`, `.sidebar-tab-panel`s, `.conversation-list` and `.sidebar-footer` (index.html 257–308). The reopen badge is a **sibling** outside the sidebar; the attach menu and input "+" menu live in the composer, not here. |
| `.console-output` | `#chat-display` (index.html 494) holds messages and in-flow panels such as `.council-chamber` (core/model-council.js) and `.subagent-card`. `#attach-menu` (line 602) and `#input-plus-menu` (line 623) are outside it; `.msg-tts-btn` is inside its message. |
| `.kernel-panel` | Created in core/kernel.js 186–210: header + `#kernel-timeline` only. Button tooltips are native `title` attributes (OS-rendered, not clipped). |
| `.modal-overlay` | Fixed, viewport-sized (style.css 2632) with a centered `.modal-content`; any fixed child is still viewport-sized relative to the overlay. |
| `.adv-modal-overlay` | Fixed full-screen (style.css 11550) wrapper used by core/soul-os.js, core/kernel.js and core/model-council.js; `<select>` popups are OS-rendered. |

### 3. `@media (max-width: 480px)` — four scoped groups

* `:root` lowers `--glass-blur` / `--glass-blur-sm` from style-anim.css's 820px
  values (8px/6px) to 6px/4px. This covers every variable-driven glass layer
  — including the `!important` ones — without adding any `!important` of ours.
* `.aether-msg, .user-msg` replace the large `var(--shadow-glass)` / 20px glow
  with a 4px shadow. The `:hover` glow in style.css is `!important`, so it is
  intentionally left untouched.
* `.sidebar, .kernel-panel` drop only their outer drop shadows; both have solid
  backgrounds, so depth is preserved by borders/backgrounds.
* `.cmd-btn, #user-input` keep a 4px blur instead of 8px/12px. Translucency and
  borders remain — the glass identity is intact.

### 4. `@media (prefers-reduced-data: reduce)`

Progressive enhancement; unknown media features make the whole block a no-op.
`:root` zeroes the blur variables (covers modals, `.glass`, bubbles, cards),
and a short selector list zeroes the hard-coded, non-`!important` blurs.
Backgrounds stay translucent, so the look survives.

## Deliberately excluded

* **`contain: size` / `contain: strict`** — would collapse panels to zero.
* **Containment on escaping UI** (`#attach-menu`, `#input-plus-menu`,
  `#sidebar-reopen-badge`, native tooltips/dropdowns) — paint containment
  would clip popovers; none of them is inside the five target panels anyway.
* **`.code-pro-panel`** — no such class exists in `index.html`, `script.js`,
  `core/*.js` or any stylesheet (verified by grep). Adding a dead selector
  would be misleading, so it is omitted; the rule is trivially addable if such
  a panel appears later.
* **`.kernel-ev` rows** — the timeline forces `scrollTop = scrollHeight` on
  every event; per-row skipping would make `scrollHeight` estimates jump
  during event bursts. The scroll container itself is the safer target.
* **`.council-chamber`, `.council-seat`, `.skills-grid`** — low item counts, or
  the scroll container whose children are already optimized.
* **`prefers-reduced-motion`** — owned by `style-motion.css`; absent here.
* **`!important`** — none used anywhere in the new file. A consequence:
  `.afc-viewer-modal` keeps style-anim.css's hard-coded `blur(20px) … !important`
  even under reduced data; overriding it would require fighting `!important`.
* **`content-visibility` on modal contents** — modals are small and rarely
  scrolled; no measurable win.

## Caveats

* **Scroll drift.** Placeholder heights are estimates. A never-rendered
  offscreen row that is much taller than its placeholder can shift scroll
  position when it first renders. `auto none` stores the real size after the
  first paint, so drift is essentially a first-visit-only effect. Long tool
  results are the largest residual risk.
* **Containment clipping.** `contain: paint` clips descendants to the panel's
  padding box: glows/shadows near panel edges and focus rings on edge children
  can be trimmed. `content-visibility` applies paint containment too, so the
  same applies to skipped rows. Re-check any future absolutely-positioned UI
  added inside these panels.
* **New containing blocks / stacking contexts.** Both `contain` and
  `content-visibility` make the element a containing block for absolutely and
  fixed positioned descendants and create a stacking context. Verified safe
  for today's markup, but a future `position: fixed` overlay appended inside a
  message or panel would be scoped to that ancestor.
* **Browser support.** Older Android WebViews may not implement
  `content-visibility`, `contain-intrinsic-size`'s `auto` keyword, or
  `prefers-reduced-data`; unsupported declarations are ignored and the page
  simply keeps current behaviour. `contain` itself is broadly supported but
  degrades the same way. No feature detection is needed for correctness.
* **Service worker.** `sw.js` has an explicit `CORE_ASSETS` precache list that
  does **not** include `style-resilience.css` (we may not edit it). CSS
  requests are handled with `netFirst`, so the file is cached after one online
  visit, but the SW owner should add `'./style-resilience.css'` to
  `CORE_ASSETS` when convenient for true first-load offline support.
* **Hover glow.** As noted above, the `!important` hover shadow on
  `.aether-msg` remains at ≤480px; this is deliberate to avoid `!important`
  escalation.

## Verification performed

* Balanced braces: 15 `{` and 15 `}` after stripping comments.
* `!important`: 0 occurrences. `prefers-reduced-motion`: 0 occurrences.
* Only the two permitted files were created; no existing file was modified.
