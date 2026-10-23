# Design tokens

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/design-tokens.md).

## The idea

**Design tokens** are the visual decisions of a design system stored as named data: colors, spacing, typography, borders, shadows and so on. Instead of writing the value directly, the code uses the token's name:

```css
/* ❌ Hardcoded values */
.button {
  background-color: #4f46e5;
  padding: 10px 12px;
  border-radius: 10px;
}

/* ✅ Using design tokens */
.button {
  background-color: var(--color-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
}
```

When the design changes (a new primary color, for example), you edit **one place**, and every screen follows.

## Why hardcoded values are a problem

In almost every front-end project, the design starts organized and slowly drifts:

- the same color shows up written five different ways (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…);
- "almost equal" spacing values appear, like `10px`, `11px` and `12px`, that should be a single one;
- styles end up scattered across CSS, SCSS, inline styles and components;
- changing a color means hunting it down by hand in many files.

The result is an inconsistent interface and code that is hard to maintain.

## Primitive and semantic tokens

- A **primitive** token names a value: `--color-indigo-600: #4f46e5`.
- A **semantic** token names a role and points to a primitive: `--color-primary: var(--color-indigo-600)`.

Code that uses semantic tokens says *why* a color is there, not only *which* color it is.

## Where tokens live

| Format | Example |
|---|---|
| CSS custom properties | `--spacing-4: 16px;` used as `var(--spacing-4)` |
| SCSS / Sass variables | `$spacing-4: 16px;` |
| Less variables | `@spacing-4: 16px;` |
| [DTCG](https://www.designtokens.org/) JSON (`*.tokens.json`) | The W3C community format, read by tools such as Style Dictionary and Tokens Studio |

TokenTidy reads all of them as the project's existing tokens, and writes all of them when it [generates tokens](generate.md).

## Where TokenTidy fits

| Step | Command |
|---|---|
| Find hardcoded values | [`check`](check.md) |
| Create tokens from the repeated values | [`generate`](generate.md) |
| Replace values with tokens | [`fix`](fix.md) |

Next: [Quick start](quick-start.md).
