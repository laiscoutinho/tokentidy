# Changelog

Each version is a git tag. Versions without a date of their own were released together with the next dated one.

## 0.0.28

- Fewer types: `size` values (`width`, `height`, `min-*`, `max-*`) are always a review item (`size/no-context`), since the code doesn't say if a size is a container, an icon or only layout. `container`, `opacity`, `z-index` and breakpoints are no longer reported, and their rules are gone (`breakpoint/plain-css`, `custom-property/unknown-use`, `value/unknown-destination`).
- A custom property with a literal inside a component (`.card { --gap: 12px }`) and a local SCSS variable are not reported: they already name the value.
- `filter: drop-shadow()` is read as a shadow. `bolder` and `lighter` are font weights. `#fff` and `#ffffff` are the same value, written in long form.
- `fill`/`stroke` attributes and the `style` of SVG drawing elements are not reported; in a stylesheet, `fill` and `stroke` still are.
- MUI `sx`: arrays, functions (`(theme) => ({…})`), variables, nested blocks and `sx` inside `*Props` (`slotProps`, `PaperProps`) are read. `fontSize`, `fontWeight`, `lineHeight` and `letterSpacing` numbers are values, not theme steps.
- JavaScript: Phaser `TextStyle` and `add.text()`, default values of parameters, and the fixed parts of a template string with `${…}`. Other libraries can be added with `styleSinks` in the config.
- `check` hides review items from the table; the footer says how many there are, and `check --review` shows them. `--json` always lists them.
- `check` says how close a near color is in words (ΔE).
- `fix`: when two tokens fit a value equally, the one whose name matches the property wins (`--spacing-4` in `padding`). Without that, the value is left as `ambiguous-token`, listing both.
- `generate`: a px token keeps the plain name (`spacing-12`), and its rem twin gets the suffix (`spacing-12-rem`). The summary says how many values already have a token (`reused` in `--json`).

## 0.0.27 (first npm release)

0.0.10 to 0.0.27 are published together as 0.0.27, the first version on npm.

- `check` prints one aligned table per file in the terminal (`--format table` forces it). The columns are the line, type, property, value and the token to use; the footer says what to do next in plain words. Pipes still get tab-separated lines, and `--json` is unchanged.
- `check` shows up to 3 nearest tokens for a value close to the grid or a palette color (`nearest` in `--json`).
- `check` lists a value equal to a token in only one theme (`#ffffff` while `.dark` sets `--bg` to `#111111`) as a review item, `token/theme-only`. `fix` never replaces it.
- `generate` writes `tokens.css` by default. `--dtcg`, `--scss`, `--less`, `--ts` and `--js` add the other formats, and a format already in the folder keeps being updated.
- `generate` reads `tokens.css` back: names and values edited there, and tokens added there, are kept by the next run and used by `fix`.
- `generate` prints one line with the folder. Diagnosis, suggestions and aliases are in `--json`, where each token also has `files`.
- Default `minOccurrences` is now 3 (minimum 2).
- `fix` prints what it did not change and why, then a short summary. The list of changed files goes to stdout only in pipes.
- The DTCG file from `generate --dtcg` no longer lists every line and column. A token keeps its count; an alias keeps the file, property and selector where it is used. `generate --json` still shows every use. On large projects the file is much smaller and does not change when a line is added.
- `check` and `fix` are faster on large projects: files are read in parallel and repeated values are normalized once.
- Running `tokentidy` with no arguments shows a welcome screen with the first three steps.
- `@angular/compiler` is pinned to 21, which supports Node 22.20 (version 22 warned with `EBADENGINE`).

## 0.0.26

- Themes (light and dark) with the DTCG Resolver Module.

## 0.0.25

- Reports: `--summary` per type, `--format github` annotations, `schemaVersion` in `--json`.

## 0.0.24

- `validate` checks a DTCG file against the 2025.10 schema and its reference rules (broken aliases, cycles, types).

## 0.0.23

- Micro-frontends: several roots, workspaces, drift between them, `:root` collisions, design-system versions and `generate --shared`.

## 0.0.22

- `tokens.ts` module, and `fix` for canvas and chart libraries.

## 0.0.21

- Consolidation in `generate`, `fix --approximate` with a prompt, `--yes`, `--no-input` and `tokentidy.decisions.json`.

## 0.0.20

- Coherence guards: close values are not merged when the element's states or contrast would change.

## 0.0.19

- Tokens from npm packages, JS themes and theme overrides. A primitive token used where a semantic alias exists becomes a suggestion.

## 0.0.18

- Angular: `host`, `@HostBinding`, `Renderer2.setStyle` and `[style]` objects.

## 0.0.17

- CSS-in-JS: styled-components, Emotion, the `css` prop and MUI `sx`.

## 0.0.16

- JS/TS style objects followed through scope and imports, DOM styles, SVG attributes, canvas and chart colors.

## 0.0.15

- SCSS and Less expressions: mixin arguments and defaults, `mat.*-overrides` maps, build-time functions.

## 0.0.14

- `check --baseline <file>` fails only on new values; `check --print-baseline` writes the baseline.

## 0.0.13

- `check` shows the closest token for a value just off the grid or the palette, with the distance.

## 0.0.12

- `check` shows the token that already has each value, `token/unknown` with "did you mean", warnings for deprecated tokens and for fallbacks that disagree with the token.

## 0.0.11

- `fix` and `check` say when repeated values have no token yet, so the tokens folder is out of date.

## 0.0.10

- Sizing properties: control and icon sizes, touch targets, container widths, scroll margins.

## 0.0.9 (2026-10-23)

- `fix` replaces exact values with their tokens: `var()` in CSS and inline styles, Sass and Less variables where a build-time value is needed, JSX values and Angular unit suffixes. `--dry-run` prints a diff.

## 0.0.8 (2026-10-23)

- 0.0.5: one or more folders or files as scope, project root detection.
- 0.0.6: `check` precision: rule ids, review items, local custom properties, `color-mix()`, vendor prefixes, breakpoints.
- 0.0.7: ignore comments with rule ids, and ignored folders and files in the config.
- 0.0.8: `generate` diagnoses the scale, names grays by the nearest palette color, reuses hand-written DTCG names and writes files safely.

## 0.0.4 (2026-10-21)

- `generate` creates design tokens from repeated values.

## 0.0.3 (2026-10-21)

- Every host: HTML, JSX/TSX, Vue, Svelte, Angular templates.

## 0.0.2 (2026-10-20)

- CSS, SCSS and Less.

## 0.0.1 (2026-10-12)

- First version: the CLI and `check`.
