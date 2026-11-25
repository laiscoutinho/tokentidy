# The `generate` command

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/generate.md).

`generate` turns the **repeated** hardcoded values of the project into design tokens, and writes them to the `design-tokens/` folder at the project root.

```bash
npx tokentidy generate                      # analyze the current folder and write tokens.css
npx tokentidy generate --dry-run            # print the files, write nothing
npx tokentidy generate --scss --dtcg        # also write _tokens.scss and tokens.tokens.json
npx tokentidy generate --min-occurrences 2  # looser: values used 2+ times (default 3)
```

## Files it writes

`tokens.css` is always written. The other formats are written only when you ask for them, or when the output folder already has them from an earlier run (then they keep being updated):

| File | When |
|---|---|
| `tokens.css` | Always, when there is at least one token. `:root { --x: ... }`. **This is the file you edit** |
| `tokens.tokens.json` | With `--dtcg`. The [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) format, for Style Dictionary, Tokens Studio and Figma |
| `_tokens.scss` | With `--scss`. Sass variables |
| `_tokens.less` | With `--less`. Less variables |
| `tokens.ts` / `tokens.js` | With `--ts` / `--js`. For values read by JavaScript (canvas, charts): see [The `tokens.ts` module](#the-tokensts-module) |
| `css/<category>.css` + `README.md` | When there are more than `splitThreshold` tokens (default 60): `tokens.css` becomes an index with `@import` |
| `tokens.light.tokens.json`, `tokens.dark.tokens.json`, `tokens.resolver.json` | With `--dtcg`, when the code has a dark theme (the dark values are always in `tokens.css`): see [Themes](themes.md) |

Example of `tokens.css`:

```css
:root {
  /* color */
  --color-gray-400: #9ca3af;
  --color-indigo-600: #4f46e5;
  --color-white: #ffffff;

  /* spacing */
  --spacing-2: 8px;
  --spacing-2_5: 10px;
  --spacing-3: 12px;

  /* radius */
  --radius-lg: 8px;
}
```

Your app must load `tokens.css` (or the SCSS/Less file) for the tokens to work.

## Editing the tokens

`tokens.css` is the source. Rename a token, change its value or add your own token there, and the next `generate --extend` and `fix` use it. Every other file (`.scss`, `.less`, `.ts`, `.tokens.json`) is rewritten from `tokens.css`, so edits made in those files are lost.

TokenTidy only reads a `tokens.css` it wrote (it recognizes the first-line comment). If the CSS has a syntax error, the previous `tokens.tokens.json` is used, when there is one.

## What it prints

In a terminal, one line says how many tokens there are and where:

```
✔ 6 tokens saved in design-tokens/ (tokens.css).
  Next: run tokentidy fix to use them in your code.
```

On a later run it also says how many are new: `✔ 8 tokens (2 new) saved in …`. The count includes tokens you added to `tokens.css` by hand. When no value is repeated enough, nothing is written:

```
No value is used 3 or more times without a token, so no token was created.
```

The details (values below the minimum, semantic aliases, consolidated values, diagnosis per type and suggestions) are in [`--json`](json-output.md). Outside a terminal (pipe, CI), the files written are also printed on the standard output, one per line.

With `--dry-run`, each file is printed as `==> file <==` followed by its content (like the `head` command), and nothing is written.

## How it decides

- **Threshold:** a value becomes a token only when it appears at least `minOccurrences` times (default 3) in the same token type. A value used only once or twice is often a local choice, not a project decision. To change it, use `--min-occurrences <n>` or `minOccurrences` in the [config](configuration.md) (minimum 2).
- **Grouping:** different spellings of the same value become one token (`#FFF`, `white` and `rgb(255 255 255)`; `12pt` and `16px`; `.2s` and `200ms`; `bold` and `700`). Values that are only *close* are merged only by [consolidation](#close-values-consolidation), which has strict rules.
- **Roles:** the same value used as `spacing`, `font-size` and `line-height` becomes three tokens.
- **Names:** spacing and sizes on the grid (`spacing-2` = 8px with a 4px grid; `spacing-2_5` = 10px); familiar scales where the value matches (`radius-lg`, `font-size-base`, `shadow-md`); colors by the nearest color of the Tailwind v4 palette and their lightness (`color-indigo-600`, `color-gray-950` for `#111827`, `color-black-a50` for black at 50% opacity); otherwise the number itself (`font-size-13`).
- **Color families and steps:** the family comes from the hue (a near-gray with a slight tint is still `gray`), and the step from the OKLCH lightness on that family's curve. The number always grows from lighter to darker, as in 50 → 950: a color takes the nearest standard step when it is free and no other color is between them, otherwise its own position (`gray-303` is darker than `gray-300`). So the names of a family never contradict their lightness.
- **The same size in two units** (`48px` and `3rem`) gives two tokens. The `px` one keeps the plain name and the `rem` one gets the unit in it (`spacing-12` and `spacing-12-rem`): `rem` follows the person's font size and `px` doesn't, so they are not the same decision.
- **Left out:** values from tests, stories and fixtures (they are [not analyzed](check.md#what-it-skips)), [review items](rules.md#review-items) such as CSS tricks (`value/hack`: `1ms`, `0.1px`, `9999em`), and values whose only token is refused by `fix` for its name are still counted as without a token.
- **Order:** by category, and from smallest to largest inside it. The same project always produces the same files.

## Close values: consolidation

A value that is *almost* another one (`15px` next to `16px`, `#4f46e6` next to `#4f46e5`) is usually an inconsistency, not a decision. `generate` merges it into the value it was meant to be, so the token set follows the project's real decisions:

- **Spacing, sizes and radius:** a value off the `gridBase` grid joins the on-grid value used in the **same role**: same type, same property family (`padding`) and same component (`.card`, `.card-footer`; `.tile` and `.panel` count as cards too). It goes to the **nearest grid step**, never more than half the grid away (`15px` → `16px`, never `12px`). A tie (`14px` between 12 and 16) goes to the step the project uses more for that type, then to the coarser grid. The target depends only on the value and its type, so the same value goes to the same step in every role. `15px`, `16px` and `17px` on cards become one `16px` token.
- **Two values on the grid are never merged** (`12px` and `16px` are two decisions). Values smaller than the grid (`1px`, `2px`) and pill radii (`9999px`) are left alone. `rem` values stay in `rem`.
- **Colors:** a color joins the most used color within `colorTolerance` (ΔE in OKLab, default `0.02`) with the same opacity. It joins the most used one, never a neighbour, so `a ≈ b ≈ c` chains don't form. Only within the **same hue**: at most 15° apart, and a neutral (gray, white, black) never joins a tinted color, however small ΔE is.
- **Font sizes:** when most of them are in `rem`, a `px` size of the same size joins the `rem` one.
- **Guards:** a merge that would break a relationship (a `:hover` color equal to the base, text losing contrast, `.btn-sm` equal to `.btn-lg`) is blocked, with the reason. These are the same [coherence guards](fix.md#values-close-to-a-token---approximate) as `fix --approximate`. A group rejected in `tokentidy.decisions.json` is not merged either.

Each merge is listed in `consolidated` in [`--json`](json-output.md), with the values merged and the merges blocked by a guard.

`generate` only creates the tokens: the code keeps `15px` until you run [`fix --approximate`](fix.md#values-close-to-a-token---approximate), which asks before changing it.

## The `tokens.ts` module

`var()` doesn't work where JavaScript reads a value: `ctx.fillStyle`, chart options, a color passed to a function. For those, `generate --ts` writes `tokens.ts` (`--js` writes `tokens.js`), with the same tokens as objects:

```ts
export const color = {
  indigo: {
    600: '#4f46e5',
  },
} as const;
```

Aliases come already resolved, since there is no `var()` there. [`fix`](fix.md#canvas-and-charts-the-tokensts-module) uses it to write `color.indigo[600]` and adds the `import`. Once generated, the module is kept up to date by every `generate`.

## Tokens the project already has

**Tokens written by hand** (`--x` in `:root`, `$x`, `@x`, `*.tokens.json`) are always reused: they are your decisions. A token the code doesn't use yet gets its type from its name or `$type`, as in [`fix`](fix.md#hand-written-tokens): with `--space-4: 16px`, a `padding: 16px` reuses it, and no `--spacing-4` is created.

- If a token already exists for a value and works everywhere the value is used (a CSS custom property), it is reused, not created again, and the summary says so (`2 values already have a token, so no new one was made for them.`). `--json` lists them in `reused`.
- If the existing token doesn't work in some place (a `$scss` variable, but the value is also used in JSX or an Angular template), a CSS token is created even for a single use, and the SCSS variable is recorded as its equivalent.
- A value already defined in a hand-written DTCG file keeps its path as the name (`color.primary` → `--color-primary`).

**Which tokens count as existing:** a custom property counts only if it's global (`:root`, `html`, `body`, even in a list like `:root, [data-theme=light]`) and no theme gives it another value. `$x`/`@x` count only at file level. It's the same rule [`fix`](fix.md#which-token-is-used) uses, so a value is never left with neither a new token nor a replacement.

## Running it again

If the output folder already has tokens generated before, `generate` needs a decision:

| Flag | What it does |
|---|---|
| `--extend` | Keeps the names TokenTidy generated before and adds the new ones |
| `--new` | Forgets TokenTidy's previous output and names everything again (hand-written tokens are still reused). Names and tokens you changed or added in `tokens.css` are lost too. Refuses if the DTCG file has tokens written by hand |
| none, in a terminal | Asks: `Keep their names and add the new ones (e), or start over (n)? [e/n]` |
| none, outside a terminal (CI, hook, pipe) or with `--json` | Stops with exit code `2`: `Use --extend to keep their names and add the new ones, or --new to start over.` |
| `--dry-run` without a flag | Shows what `--extend` would produce |

## Diagnosis, suggestions and semantic aliases

These three are in [`--json`](json-output.md) (`diagnosis`, `suggestions`, `aliases`), not in the terminal output.

- **Diagnosis:** per type, how many different values, how many have a token, and what share of the uses already falls on a token. Spacing is compared with IBM Carbon (13 steps) and font sizes with Material 3 (15 styles), only as a reference: above it, it says so and counts the values used once, the first candidates to merge.
- **Suggestions:** spacing and sizes off the grid, and the same size written in `px` and `rem`. Nothing is changed by them; you decide.
- **Semantic aliases:** when the role of a color is clear (property + words in the selector + state), an alias pointing to the primitive is added: `--color-text-danger: var(--color-red-500)`. Turn it off with `"semanticTokens": false` in the [config](configuration.md). With a dark theme in the code, these aliases get a value per mode ([Themes](themes.md)).

## What the DTCG file keeps

With `--dtcg`, each token in `tokens.tokens.json` keeps, in `$extensions["dev.tokentidy"]`, its normalized value, how many times it is used, every spelling found and its equivalents. A semantic alias also keeps **where** it is used (file, property and selector), which `fix` needs to put it only where the role fits. Lines and columns are left out on purpose: they change with every edit, and the file is meant to be committed. To see every use of a value, run `generate --json`.

## Safe writing

- The output folder must be inside the project (also through symbolic links); otherwise exit code `2`.
- Each file is written atomically (a temporary file, then a rename), so an interrupted run never leaves half a file.
- TokenTidy only overwrites or deletes files it generated (it recognizes their header). Generated files that are no longer needed (such as `css/*.css` when the split goes away) are removed; a file of yours with the same name stops the run with an error.
- A corrupted `tokens.tokens.json` (when `tokens.css` can't be read) stops the run with its path and `Fix it or use --out`.

## Options

| Option | What it does |
|---|---|
| `--min-occurrences <n>` | Uses needed for a value to become a token (default 3, minimum 2) |
| `--out <dir>` | Output folder (default: `design-tokens` inside the project) |
| `--config <file>` | Config file (default: `tokentidy.config.json` in the project) |
| `--extend` / `--new` | See [Running it again](#running-it-again) |
| `--dtcg` | Also writes `tokens.tokens.json` (and the theme files) |
| `--scss` / `--less` | Also writes `_tokens.scss` / `_tokens.less` |
| `--ts` / `--js` | Also writes `tokens.ts` / `tokens.js` |
| `--dry-run` | Prints the files instead of writing them |
| `--shared <dir>` | Micro-frontends: values used by two or more apps go to this folder, the rest to each app's folder ([Micro-frontends](micro-frontends.md#a-shared-token-package-generate---shared)) |
| `--json` | Prints the result as JSON ([JSON output](json-output.md)) |

## Exit code

`0` when the tokens were generated; `1` if a file has a syntax error (the token set may be incomplete); `2` for a usage or config error, an output folder outside the project or a corrupted token file. See [Exit codes](exit-codes.md).
