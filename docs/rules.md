# Rules

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/rules.md).

Every item [`check`](check.md) prints has a **rule**: a short id that says what was found. Rule ids are also what [ignore comments](ignore-comments.md) use.

## Violations

A violation's rule is `<type>/hardcoded` (`color/hardcoded`, `spacing/hardcoded`…). The type is also the token category used by [`generate`](generate.md).

| Type | Properties | Values |
|---|---|---|
| `color` | `color`, `background*`, `border*-color`, `outline*`, `fill`, `stroke`, `text-decoration*` and others | Any color syntax: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`… A color function counts as one value. `#fff` and `#ffffff` are the same value |
| `spacing` | `margin*`, `padding*` (including logical ones), `gap`, `row-gap`, `column-gap`, `scroll-margin*`, `scroll-padding*`, `border-spacing` | Lengths in `px`, `rem`, `em`, `pt` |
| `radius` | `border-radius` and each corner | Lengths (`50%`, the circle, is a shape, not a token) |
| `border-width` | `border*-width`, and the width in `border`, `outline` | Lengths |
| `font-family` | `font-family`, and the family in `font` | The whole font list, unless it has only generic families |
| `font-size`, `font-weight`, `line-height` | Their properties, and their position in the `font` shorthand | Lengths, numbers (`700`, `1.5`), `bold`, `bolder` and `lighter` |
| `letter-spacing` | `letter-spacing` | Lengths (with the sign) |
| `shadow` | `box-shadow`, `text-shadow`, and each `drop-shadow()` in `filter` | The whole shadow (all layers, with its color) as one value |
| `duration`, `easing` | `transition*`, `animation*` | `s`/`ms` and `cubic-bezier()` |

A few details:

- **Shorthands** give one item per part: `margin: 4px 8px` gives two; `border: 1px solid #ddd` gives a `border-width` and a `color`.
- **Functions** are looked into: gradients, `color-mix()` and Sass/Less color functions (`darken(#4f46e5, 10%)`). `calc()`, `clamp()`, `min()` and `max()` are layout math and are not.
- **Vendor prefixes** (`-webkit-box-shadow`) follow the unprefixed property.
- **One row per declaration:** `box-shadow: 0 1px 2px #0003` is one value, and each part of `margin: 4px 8px` points to the same declaration (`declaration` in [`--json`](json-output.md)).
- **Token blocks** are definitions, not violations: custom properties in `:root`/`html` (also `:root[data-theme=dark]`), in a rule with only custom properties (not `:host`), and overrides of names defined there.

## Review items

Review items are what the code alone can't decide. They are counted, but never change the exit code and never become tokens. The table shows them with [`check --review`](check.md#reading-the-result); `--json` always lists them.

| Rule | When |
|---|---|
| `size/no-context` | `width`, `height`, `min-*`, `max-*`, `inline-size`, `block-size` with a length. A size can be a container, an icon or only layout, and the code doesn't say which |
| `value/hack` | A CSS trick that looks like a design value: a near-zero duration (up to 10ms, the reduced-motion trick), a sub-pixel length (`0.1px` against margin collapse), an extreme length (9999, to push off-screen), a 1px `width`/`height` on `::before`/`::after` (a hairline) and the 1px box of the visually-hidden pattern (`position: absolute` + `overflow: hidden` + `clip`/`clip-path: inset(50%)`). The message says which one. A token would name the trick, and a nearby token would break it. A pill radius (`9999px` in `border-radius`) is a design value and stays a violation |
| `token/theme-only` | A value equal to a token in only one theme (`#ffffff` while `:root` has `--bg: #ffffff` and `.dark` sets another value). The value is also a violation; `fix` never replaces it, because the token would follow the theme ([check](check.md#which-token-fits)) |

## Suggestions

| Rule | When |
|---|---|
| `token/prefer-alias` | A primitive token is used where a semantic alias exists for that role (`var(--color-red-500)` in `.error`, with `--color-text-danger`). Never fails ([check](check.md#which-token-fits)) |

## Micro-frontends

With two or more apps ([Micro-frontends](micro-frontends.md)):

| Rule | Severity | When |
|---|---|---|
| `mfe/root-collision` | violation | Two apps define the same global custom property with different values |
| `mfe/drift` | review | The same role has a different most-used value in each app |
| `mfe/version-mismatch` | review | The apps depend on different versions of the same design-system package |

## Token files

[`validate`](validate.md#what-it-checks) has its own rules (`schema/invalid`, `reference/broken`, `reference/cycle`…).

## Warnings about ignore comments

These go to the error output and never change the exit code. See [Ignore comments](ignore-comments.md).

| Rule | When |
|---|---|
| `ignore/too-broad` | A directive without rule ids (it ignores nothing) |
| `ignore/unknown-rule` | A rule id that doesn't exist |
| `ignore/unused` | A directive with nothing to ignore on its line |

## What is not reported

- Values that already use a token: `var(--x)`, `$x` and `@x`, with a [warning](check.md#warnings-about-tokens) if the fallback in `var(--x, 12px)` disagrees with the token; a shadow with `var()` in any layer.
- Token definitions themselves: `--color: #fff`, `$color: #fff`, `@color: #fff`. A custom property with a literal inside a component (`.card { --gap: 12px }`) is a named value of that component: it is not reported, and it is not offered as a token to other files.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, percentages and viewport units (`%`, `vw`, `vh`).
- Declarations inside `@font-face` (the font's definition).
- SCSS interpolation (`#{...}`), `@include` arguments and `@mixin` defaults (what the mixin does with a value is unknown), Less mixin calls and comments. Angular Material `mat.*-overrides` maps **are** read.
- Numbers and non-color values in objects passed to functions TokenTidy doesn't know: `resize({ width: 300 })` is not a style. Libraries can be added with [`styleSinks`](configuration.md#style-sinks).
- Drawing inside an SVG: `fill`/`stroke` attributes, and the `style` of `<path>`, `<circle>`, `<g>`, gradients and other drawing elements. The root `<svg>` is read. In a stylesheet, `fill` and `stroke` **are** reported.
- Props passed down through components (a style prop like `<Stack gap="12px">` **is** read, see [check](check.md#where-it-looks)) and re-exported objects (`export { a } from './b'`). In a template string with `${...}`, only the fixed parts are read (`` `1px solid ${color}` `` gives `1px`).
- Files of tests, stories and fixtures (see [check](check.md#what-it-skips)).
- Not yet: Vue/Svelte files (listed as skipped).
- Out of scope: `z-index`, `opacity`, `@media`/`@container` breakpoints, `filter` other than `drop-shadow()`, `backdrop-filter`, `transform`/`translate`, position offsets (`top`, `right`, `bottom`, `left`, `inset`), `outline-offset`, `text-underline-offset` and `stroke-width`. They place or affect one element; they are not scale decisions.
