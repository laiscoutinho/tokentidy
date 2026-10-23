# Rules

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/rules.md).

Every item [`check`](check.md) prints has a **rule**: a short id that says what was found. Rule ids are also what [ignore comments](ignore-comments.md) use.

## Violations

A violation's rule is `<type>/hardcoded` (`color/hardcoded`, `spacing/hardcoded`…). The type is also the token category used by [`generate`](generate.md).

| Type | Properties | Values |
|---|---|---|
| `color` | `color`, `background*`, `border*-color`, `outline*`, `fill`, `stroke`, `text-decoration*` and others | Any color syntax: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`… A color function counts as one value |
| `spacing` | `margin*`, `padding*` (including logical ones), `gap`, `row-gap`, `column-gap` | Lengths in `px`, `rem`, `em`, `pt` |
| `size` | `width` and `height` with the **same value** in the same rule (icon, avatar) | Lengths |
| `container` | `width`, `max-width`, `inline-size` of a horizontally centered block (`margin: 0 auto`) | Lengths |
| `radius` | `border-radius` and each corner | Lengths and `%` |
| `border-width` | `border*-width`, and the width in `border`, `outline` | Lengths |
| `font-family` | `font-family`, and the family in `font` | The whole font list, unless it has only generic families |
| `font-size`, `font-weight`, `line-height` | Their properties, and their position in the `font` shorthand | Lengths, `bold`, numbers (`700`, `1.5`) |
| `letter-spacing` | `letter-spacing` | Lengths (with the sign) |
| `shadow` | `box-shadow`, `text-shadow` | The whole shadow (all layers) as one value |
| `opacity` | `opacity`, `fill-opacity`… | Numbers and `%` between 0 and 1 |
| `duration`, `easing` | `transition*`, `animation*` | `s`/`ms` and `cubic-bezier()` |
| `z-index` | `z-index` | Integers from 2 up (or -2 down) |
| `breakpoint` | Conditions of `@media` and `@container` | Lengths, in SCSS/Sass/Less (a variable works there) |

A few details:

- **Shorthands** give one item per part: `margin: 4px 8px` gives two; `border: 1px solid #ddd` gives a `border-width` and a `color`.
- **Functions** are looked into: `calc()`, gradients, `color-mix()` and Sass/Less color functions (`darken(#4f46e5, 10%)`).
- **Vendor prefixes** (`-webkit-box-shadow`) follow the unprefixed property.
- **Local custom properties** with a literal (`.card { --gap: 12px }`) are violations too, typed by where they are used (`var(--gap)` in `gap` → `spacing/hardcoded`).
- **Token blocks** are definitions, not violations: custom properties in `:root`/`html` (also `:root[data-theme=dark]`), in a rule with only custom properties (not `:host`), and overrides of names defined there.

## Review items

Review items are what the code alone can't decide. They are printed and counted, but never change the exit code and never become tokens.

| Rule | When |
|---|---|
| `size/no-context` | `width`, `height`, `min-*`, `max-*`, `inline-size`, `block-size` with a length that isn't a centered container or a square element |
| `breakpoint/plain-css` | A length in a `@media`/`@container` condition in plain CSS, where `var()` doesn't work |
| `custom-property/unknown-use` | A local custom property whose role can't be told from its uses or its value |

## Warnings about ignore comments

These go to the error output and never change the exit code. See [Ignore comments](ignore-comments.md).

| Rule | When |
|---|---|
| `ignore/too-broad` | A directive without rule ids (it ignores nothing) |
| `ignore/unknown-rule` | A rule id that doesn't exist |
| `ignore/unused` | A directive with nothing to ignore on its line |

## What is not reported

- Values that already use a token: `var(--x)` (including the fallback in `var(--x, 12px)`), `$x` and `@x`; a shadow with `var()` in any layer.
- Token definitions themselves: `--color: #fff`, `$color: #fff`, `@color: #fff`.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, percentages and viewport units (`%`, `vw`, `vh`), and `z-index` of `-1`, `0` and `1`.
- Declarations inside `@font-face` (the font's definition) and `opacity` inside `@keyframes` (animation choreography).
- SCSS interpolation (`#{...}`), `@include` parameters, Less mixin calls and comments.
- Not yet: style objects outside `style={{}}` (`const styles = { gap: 12 }`), CSS-in-JS (styled-components) and Vue/Svelte files (listed as skipped).
- Out of scope: `filter`/`backdrop-filter`, `transform`/`translate`, position offsets (`top`, `right`, `bottom`, `left`, `inset`), `outline-offset`, `text-underline-offset` and unitless `stroke-width`. They place or affect one element; they are not scale decisions.
