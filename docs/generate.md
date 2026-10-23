# The `generate` command

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/generate.md).

`generate` turns the **repeated** hardcoded values of the project into design tokens, and writes them to the `design-tokens/` folder at the project root.

```bash
npx tokentidy generate                      # analyze the current folder and write the tokens
npx tokentidy generate --dry-run            # print the files, write nothing
npx tokentidy generate --min-occurrences 3  # stricter: only values used 3+ times
```

## Files it writes

| File | When |
|---|---|
| `tokens.tokens.json` | Always. The source of truth, in the [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) format |
| `tokens.css` | Always. `:root { --x: ... }`, generated from the JSON |
| `_tokens.scss` | When the project has `.scss` or `.sass` files |
| `_tokens.less` | When the project has `.less` files |
| `css/<category>.css` + `README.md` | When there are more than `splitThreshold` tokens (default 60): `tokens.css` becomes an index with `@import` |

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

## What it prints

The standard output lists the files written; the summary goes to the error output:

```
design-tokens/tokens.tokens.json
design-tokens/tokens.css
design-tokens/_tokens.scss
7 new tokens, 0 kept, 0 semantic aliases
16 values used fewer than 2 times were not turned into tokens
diagnosis	color	9 values, 5 tokens, 82% of uses on a token
diagnosis	spacing	18 values, 6 tokens, 71% of uses on a token; above Carbon's 13 spacing steps, 9 values used once
suggestion	spacing	10px is off the 4px grid (nearest: 8px or 12px)
```

With `--dry-run`, each file is printed as `==> file <==` followed by its content (like the `head` command), and nothing is written.

## How it decides

- **Threshold:** a value becomes a token only when it appears at least `minOccurrences` times (default 2) in the same token type. A value used once isn't a repeated design decision.
- **Grouping:** different spellings of the same value become one token (`#FFF`, `white` and `rgb(255 255 255)`; `12pt` and `16px`; `.2s` and `200ms`; `bold` and `700`). Close values (`15px` and `16px`) and `px`/`rem` (`16px` and `1rem`) are **not** merged: the difference may be intentional.
- **Roles:** the same value used as `spacing`, `font-size` and `line-height` becomes three tokens.
- **Names:** spacing and sizes on the grid (`spacing-2` = 8px with a 4px grid; `spacing-2_5` = 10px); familiar scales where the value matches (`radius-lg`, `font-size-base`, `shadow-md`, `container-md`); colors by the nearest color of the Tailwind v4 palette and their lightness (`color-indigo-600`, `color-gray-950` for `#111827`, `color-black-a50` for black at 50% opacity); otherwise the number itself (`font-size-13`).
- **Order:** by category, and from smallest to largest inside it. The same project always produces the same files.

## Tokens the project already has

**Tokens written by hand** (`--x` in `:root`, `$x`, `@x`, `*.tokens.json`) are always reused: they are your decisions.

- If a token already exists for a value and works everywhere the value is used (a CSS custom property), it is reused and listed (`N values already have a token in the project`).
- If the existing token doesn't work in some place (a `$scss` variable, but the value is also used in JSX or an Angular template), a CSS token is created even for a single use, and the SCSS variable is recorded as its equivalent.
- A value already defined in a hand-written DTCG file keeps its path as the name (`color.primary` → `--color-primary`).

## Running it again

If the output folder already has a `tokens.tokens.json`, `generate` needs a decision:

| Flag | What it does |
|---|---|
| `--extend` | Keeps the names TokenTidy generated before and adds the new ones |
| `--new` | Forgets TokenTidy's previous output and names everything again (hand-written tokens are still reused). Refuses if the DTCG file has tokens written by hand |
| none, in a terminal | Asks: `Extend them (e) or start over (n)? [e/n]` |
| none, outside a terminal (CI, hook, pipe) or with `--json` | Stops with exit code `2`: `Use --extend to reuse them or --new to start over.` |
| `--dry-run` without a flag | Shows what `--extend` would produce |

## Diagnosis, suggestions and semantic aliases

- **Diagnosis** (`diagnosis` lines): per type, how many different values, how many have a token, and what share of the uses already falls on a token. Spacing is compared with IBM Carbon (13 steps) and font sizes with Material 3 (15 styles), only as a reference: above it, the line says so and counts the values used once, the first candidates to merge.
- **Suggestions** (`suggestion` lines, only printed): spacing and sizes off the grid, and the same size written in `px` and `rem`. Nothing is changed by them; you decide.
- **Semantic aliases:** when the role of a color is clear (property + words in the selector + state), an alias pointing to the primitive is added: `--color-text-danger: var(--color-red-500)`. Turn it off with `"semanticTokens": false` in the [config](configuration.md).

## What the JSON keeps

Each token in `tokens.tokens.json` keeps, in `$extensions["dev.tokentidy"]`, its normalized value, how many times it is used, every spelling found, its equivalents and every **occurrence** (file, line, column, property, selector…). That is what [`fix`](fix.md) uses to replace the values.

## Safe writing

- The output folder must be inside the project (also through symbolic links); otherwise exit code `2`.
- Each file is written atomically (a temporary file, then a rename), so an interrupted run never leaves half a file.
- TokenTidy only overwrites or deletes files it generated (it recognizes their header). Generated files that are no longer needed (such as `css/*.css` when the split goes away) are removed; a file of yours with the same name stops the run with an error.
- A corrupted `tokens.tokens.json` stops the run with its path and `Fix it or use --out`.

## Options

| Option | What it does |
|---|---|
| `--min-occurrences <n>` | Uses needed for a value to become a token (minimum 2) |
| `--out <dir>` | Output folder (default: `design-tokens` inside the project) |
| `--config <file>` | Config file (default: `tokentidy.config.json` in the project) |
| `--extend` / `--new` | See [Running it again](#running-it-again) |
| `--dry-run` | Prints the files instead of writing them |
| `--json` | Prints the result as JSON ([JSON output](json-output.md)) |

## Exit code

`0` when the tokens were generated; `1` if a file has a syntax error (the token set may be incomplete); `2` for a usage or config error, an output folder outside the project or a corrupted token file. See [Exit codes](exit-codes.md).
