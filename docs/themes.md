# Themes (light and dark)

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/themes.md).

When the code already has a dark theme written by hand, `generate` turns each pair of colors (one for light, one for dark) into **one semantic token with a value per mode**. After `fix`, the light rule and the dark rule use the same token, and the theme switch happens in a single place.

## What counts as a dark theme

A rule whose selector starts with a dark marker, or that is inside a dark media query:

| Form | Example |
|---|---|
| Class | `.dark`, `.dark-mode`, `.dark-theme`, `.theme-dark`, `.mode-dark` |
| Attribute | `[data-theme="dark"]`, `[data-mode="dark"]`, `[data-color-scheme="dark"]` |
| Media | `@media (prefers-color-scheme: dark)` |
| Angular | `:host-context(.dark)` |

The light value is the same selector without the marker: `.dark .card` pairs with `.card`, and `.dark body` or `.dark` alone with `body`/`:root`.

A pair becomes a theme token only when it is clear: one value per mode, and different values. `.darker`, selectors with other pseudo-classes, selector lists, rules inside other media queries and roles with two light colors are left alone.

## Example

```css
body { background: #ffffff; color: #111827; }
.dark body { background: #111827; color: #f9fafb; }
.card { background: #ffffff; }
.dark .card { background: #1f2937; }
```

`generate` writes:

```css
:root {
  --color-gray-900: #1f2937;
  --color-gray-950: #111827;
  --color-white: #ffffff;
  --color-bg-card: var(--color-white);
  --color-bg-default: var(--color-white);
  --color-text-default: var(--color-gray-950);
}

.dark {
  --color-bg-card: var(--color-gray-900);
  --color-bg-default: var(--color-gray-950);
  --color-text-default: var(--color-white);
}
```

The dark block repeats the selector the project already uses (`.dark`, `[data-theme="dark"]`) or, for the media query, `@media (prefers-color-scheme: dark) { :root { … } }`. The values a theme needs become tokens even when used only once.

`fix` then writes `var(--color-bg-card)` in both `.card` and `.dark .card`.

## Files

Besides the usual files, `generate` writes:

| File | What it has |
|---|---|
| `tokens.light.tokens.json` | The semantic tokens with their light values (aliases to the primitives) |
| `tokens.dark.tokens.json` | The same tokens with their dark values, and the selectors used for dark |
| `tokens.resolver.json` | A [DTCG Resolver](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) (`2025.10`): the base tokens plus a `theme` modifier with `light` (default) and `dark` |

Tools that read the Resolver Module produce each theme from these files, and [`validate`](validate.md) checks them. A `tokens.resolver.json` that TokenTidy didn't write is never overwritten.

## Limits

- Colors only, and only a dark theme over a light default. A project whose default is dark with a `.light` override isn't detected.
- Custom properties that the project already redefines per theme (`--bg` in `:root` and in `.dark`) are left as they are: they already are a theme.
- `_tokens.scss`, `_tokens.less` and the `tokens.ts` module keep only the light value.
- Turned off together with semantic aliases (`"semanticTokens": false`).
