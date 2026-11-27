# AETHER Animation Choreography — wiring notes

Owned files: `style-anim.css`, `ANIM_NOTES.md`. Nothing else was created or
modified; no git write commands were run.

## Exact `<link>` tag and load order

Add **one** line to `<head>` in `index.html`, immediately after the existing
`style-motion.css` link (currently line 61) and before the KaTeX link:

```html
<link rel="stylesheet" href="style-anim.css">
```

Resulting AETHER block:

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="style-ivory.css">
<link rel="stylesheet" href="style-mobile.css">
<link rel="stylesheet" href="style-motion.css">
<link rel="stylesheet" href="style-anim.css">   <!-- new: last among AETHER sheets -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous" media="print" onload="this.media='all'">
```

Why last: the overrides must beat all earlier sheets at equal specificity.
`style-motion.css` still owns `will-change` hints and the
`@media (prefers-reduced-motion: reduce)` block — loading after it is safe,
because its clamp uses `... !important` and therefore still wins. This file
adds **no** reduced-motion block of its own.

## What `style-anim.css` changes

### New `:root` tokens (new names only — no existing variables renamed)

| Token | Value |
| --- | --- |
| `--motion-fast` | `120ms` |
| `--motion-base` | `180ms` |
| `--motion-slow` | `320ms` |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |

`--anim-fast`, `--anim-med`, `--anim-spring`, `--anim-bounce`, `--glass-blur*`,
`--radius-*` and all 70 `@keyframes` are untouched.

### `transition: all` replacement (80 declarations / 82 unique selectors)

Every original `transition: all` selector is covered. Longhands
`transition-property / -duration / -timing-function` are used so nothing else
in the cascade is reset. Property list is always the cheap set:
`transform, opacity, color, background-color, border-color`.

**Fast tier — 120ms** (was 0.12–0.18s):
`.sidebar-tab`, `.afc-btn`, `.ws-file-edit-btn`, `.ws-file-del-btn`,
`.ws-editor-tb-btn`, `.proj-btn`, `.ai-import-copy-btn`, `.model-chip`,
`.aether-dialog-btn`, `.cbtn`, `.cb-btn`, `.cb-console-clear`,
`.cb-console-close`, `.bg-act-btn`, `.ws-pow-btn`, `.agent-stop-btn`,
`.flux-btn`, `.call-note-btn`, `.cal-indicator`, `.dr-btn-edit`,
`.dr-btn-start`, `.dr-btn-stop`, `.cb-btn-diff`, `.call-panel-close`,
`.wb-tool-btn`, `.wb-dl-btn`, `.wb-send-btn`, `.img-card-add`, `.puter-cm-btn`,
`.groq-effort-btn`, `.pin-dot`, `.pin-key`, `.clarif-btn-skip`,
`.clarif-btn-send`, `.construct-back`, `.init-wizard-stack-btn`,
`.init-wizard-actions button`, `.skills-cat-btn`, `.skill-detail-btn`.

**Base tier — 180ms** (was 0.2–0.25s):
`.sidebar-toggle`, `.new-chat-btn`, `.conversation-item`,
`.conversation-delete`, `.clear-all-btn`, `.cmd-btn`,
`.code-copy-btn.modern-copy`, `.aether-msg a`, `.action-btn`,
`.attach-menu-item`, `.ocr-package-remove`, `.close-ocr-btn`,
`.preview-remove`, `.preview-minimize`, `.action-control-btn`, `.attach-btn`,
`.image-btn`, `.code-run-btn`, `.send-btn`, `.modal-close`,
`.reset-default-btn`, `.ws-option-btn`, `.ctx-limit-set`, `.toggle-state`,
`.ob-btn-primary`, `.ob-btn-sec`, `.ob-chip`, `.ob-persona`, `.ob-style-opt`,
`.provider-card`, `.ob-model-opt`, `.stt-btn`, `.bg-indicator`,
`.call-panel-start`, `.soul-modal-close`, `.soul-clear-btn`,
`.iap-btn-proceed`, `.iap-btn-chat`.

**Slow tier — 320ms** (was 0.3s):
`.upload-area`, `.status-model-pill`, `.inline-agent-plan.iap-accepted`.

**Toggle thumb (layout → compositor):** `.toggle-slider`,
`.toggle-slider::before`, and
`.toggle-label input[type="checkbox"]:checked + .toggle-slider::before`.
The *effective* rule in `style.css` (the later of two definitions) moved the
thumb with `left: 3px → 22px`. That is replaced with `left: 3px` held constant
and `transform: translateX(19px)` on `:checked`, preserving the exact visual
travel while removing the layout-triggering `left` transition.
`.cbtn` appears twice in `style.css` (0.18s and 0.2s); it is normalised once in
the fast tier.

### Mobile glass (`@media (max-width: 820px)`)

- `:root` redefines `--glass-blur` → `blur(8px) saturate(1.4)` and
  `--glass-blur-sm` → `blur(6px) saturate(1.25)`. This reduces every
  `var(--glass-blur*)` consumer — including the `!important` declarations on
  `.modal-content`, `.glass`, `.notification-toast`, etc. — without adding
  `!important` to a variable.
- Hard-coded heavy blurs reduced to ~8px: `.call-overlay` (18px),
  `.init-wizard-modal` (22px), `.call-ui` (16px), `.onboarding-overlay`
  (12px), `.input-deck.is-raised` / `body.composer-raised .input-deck`
  (12px), `.input-row-v2` (22px) and `.input-plus-menu` (20px), both with
  `saturate(1.4)` where the original had saturate.
- `.afc-viewer-modal` (20px `!important`, plus an earlier 14px rule) is the
  **only** place `!important` appears in this file — necessary to beat the
  existing `!important` declaration. `-webkit-backdrop-filter` is kept in sync
  everywhere.

## What stayed `linear` / `ease-in-out`, and why

A full audit found **no** UI entrance/exit or hover `transition` using `linear`
or `ease-in-out`, so nothing had to be "upgraded" — there was no candidate to
change. Every one of the 55 `linear` and 48 `ease-in-out` tokens in `style.css`
belongs to an ambient `animation` loop or a functional meter:

- `linear` (14 animation declarations): `ap-float`, `ws-spin`, `ob-spin`,
  `spin`, `fring`, `alispin`, `dr-spin` — continuous spins/floats that would
  visibly stutter with an ease.
- `ease-in-out` (30 animation families): `scanline-flicker`, `pulse-ring`,
  `glow-pulse`, `pulse-yellow`, `pulse-magenta` (and `pulse-*`, `*-pulse` in
  general), `ap-icon-pulse`, `pulse-thought`, `qw35-sb-pulse`, `qw35-shimmer`,
  `qw35-dot-pulse`, `pill-pulse`, `dr-pulse`, `tts-pulse`, `mic-pulse`,
  `bg-pulse`, `fspk`, `crp`, `wvba`, `callbtnpulse`, `aldp`, `alipulse`,
  `aliglow`, `aliwave` (ring/orbit/wave), `cp-avatar-glow`, `cp-dot-pulse`,
  `call-avatar-glow`, `pulse-dot`, `pulse-connection`, `cursor-blink`,
  `beast-pulse`, `soul-pulse`. These are deliberately sinusoidal breathing
  loops; changing them to a one-shot ease-out would break their symmetry.
- `.timer-bar { transition: width .9s linear, background .3s }` — a progress
  meter; linear width is correct (constant rate), not a UI entrance.

Entrance animations (`modal-spring`, `slide-up`, `fade-in`, `popup-in`, etc.)
were already on their own easings and are left untouched. The modern
`--ease-out` is applied to interactive transitions through the replacement
rules above.

## Caveats

1. **Glass layer already uses `!important` transitions.** `style.css` lines
   ~9450–9459 and ~9643–9649 set
   `transition: background/color/border-color/transform/box-shadow ... !important`
   on `.cmd-btn`, `.afc-btn`, `.cb-btn`, `.action-control-btn` and
   `button[class*="btn"]`. That list is already explicit (no `all`), so those
   selectors keep the glass-layer list; adding another `!important` would only
   start a cascade war and would remove the intended hover lift/glow. The
   non-important rules here are the fallback when that layer is absent.
2. **Box-shadow / gradient / inset-shadow hovers now snap** on the selectors
   whose `transition: all` was replaced (e.g. `.sidebar-toggle:hover`,
   `.call-panel-start:hover`). Intentional: those repaint. The visual end
   state is unchanged.
3. **`button[class*="btn"]` has higher specificity** than a plain class
   selector, so on actual `<button>` elements the glass-layer transition wins
   for any `*btn` class. This is the same as caveat 1 and is safe.
4. **Ivory theme** keeps its `backdrop-filter: none !important` and its
   higher-specificity `blur(10px)` overlay rules; the mobile overrides do not
   fight them, so the light theme is unchanged apart from the shared
   `--glass-blur*` variables (which ivory only uses where it has not opted out).
5. **Progress/meter width transitions** (`.timer-bar`, sidebars, call panel)
   are functional and were not part of `transition: all`; left as-is.
6. **Reduced motion** is exclusively `style-motion.css`'s job; this file adds
   zero `@media (prefers-reduced-motion: ...)` rules and no keyframes.

## Verification performed

- Braces balanced (12 open / 12 close, ignoring comments).
- 0 `@keyframes` added, 0 keyframes removed or renamed.
- 0 `prefers-reduced-motion` blocks added.
- 2 `!important` tokens total, both on the single `.afc-viewer-modal` mobile
  blur override (standard + `-webkit-`).
- 82/82 unique selectors from the original 80 `transition: all` declarations
  are present in the replacement rules (script-checked).
