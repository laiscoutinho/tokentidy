# TokenTidy commands

This file lists every TokenTidy command: the ones that already work and the ones planned in the [development guide](development-guide.md). Update it whenever a new command is implemented.

**Legend:** 🟢 Works · 🟡 Proof of concept · ⚪ Planned (the name may change)

---

## Local setup

Run these commands at the project root (`tokentidy/`):

| Command | What it does |
|---|---|
| `npm install` | Downloads the dependencies listed in `package.json` into `node_modules` |
| `npm run build` | Compiles `src/` (TypeScript) into `dist/` (JavaScript), which is what the `tokentidy` command runs |
| `npm link` | Creates the global `tokentidy` command, pointing to the project's `dist/`. Only needs to run once, or again if you switch Node versions with nvm |
| `npm unlink -g tokentidy` | Removes the global `tokentidy` command |

`npm link` points to `dist/`, so after changing the code run `npm run build` (or keep `npm run build:watch` open in a terminal, which recompiles on every change).

Without build or link, you can run straight from the source: `npm run dev -- check ./src` (Node runs the `.ts` files by itself).

---

## Test as a user (real install)

`npm link` uses the whole project folder, so it hides problems like a file left out of the package or an undeclared dependency. To simulate someone installing TokenTidy in their project, use `npm pack`, which builds the same package that would go to npm.

Manual tests live in the lab, outside this repository: `../tcc-labs/testar-tokentidy/`, one folder per version. See its README for the full flow and the results of each version.

```bash
# 1. At the tokentidy/ root: builds and creates tokentidy-0.0.4.tgz
npm pack

# 2. In the lab, create the version folder and install the package as a dev dependency
mkdir -p ../tcc-labs/testar-tokentidy/v0.0.4
mv tokentidy-0.0.4.tgz ../tcc-labs/testar-tokentidy/v0.0.4/
cd ../tcc-labs/testar-tokentidy/v0.0.4
npm init -y && npm install -D ./tokentidy-0.0.4.tgz

# 3. Use it like a user would, on the lab's base projects
npx tokentidy --help
npx tokentidy check ../../todo-list-original/react/todo-list-react
```

| Command | What it does |
|---|---|
| `npm pack --dry-run` | Lists the files that would go in the package, without creating the `.tgz` |
| `npm pack` | Creates the `.tgz` (ignored by git) |
| `npx tokentidy` | Runs the command installed in the test project's `node_modules/.bin` |

`npm pack` runs the build first (the `prepare` script, which also runs on `npm install` and when installing straight from GitHub). What goes into the package is defined by the `"files"` field in `package.json`: only the `dist/` folder (compiled JavaScript and types). `README.md` and `package.json` are always included.

Unlike `npm link`, the package is a copy: after changing the code, run `npm pack` and `npm install -D` again.

---

## Tool commands

### 🟢 `tokentidy check <dir>`

Analyzes the project and lists the **hardcoded values**: visual values written straight into the code instead of using a token.

**Where it looks:**

| Host | Files | What is read |
|---|---|---|
| `css` | `.css`, `<style>` in `.html` | every declaration |
| `scss` | `.scss`, Angular `styles:` | every declaration; `$variables` are tokens |
| `sass` | `.sass` (indented syntax) | every declaration; `$variables` are tokens |
| `less` | `.less` | every declaration; `@variables` are tokens, mixin calls are skipped |
| `html` | `.html` | inline `style="..."` |
| `jsx` | `.jsx`, `.tsx`, `.js`, `.ts` | `style={{ ... }}` (camelCase and numbers in px, `padding: 8`) |
| `angular-template` | Angular `template:` and `.html` files referenced by `templateUrl` | `style="..."`, `[style.padding.px]="4"`, `[ngStyle]="{...}"` |

Ignores the `node_modules`, `dist`, `build`, `.git`, `coverage`, `.angular`, `.next`, `.nuxt` and `out` folders, hidden folders, and `.d.ts`, `*.spec.*`, `*.test.*`, `*.stories.*` and `*.min.*` files. Token files (`*.tokens.json`) are read as existing tokens, not analyzed as code.

```bash
tokentidy check ./src           # relative folder
tokentidy check .               # current folder
tokentidy check ~/projects/app  # absolute path
```

The output is only the data, one hardcoded value per line, with four tab-separated fields: position (`file:line:column`), token type, property and value.

```
src/App.jsx:29:28	color	color	#4f46e5
src/App.jsx:29:72	font-weight	font-weight	bold
src/App.jsx:29:93	spacing	margin-bottom	24
src/App.scss:8:8	spacing	gap	10px
```

The path is relative to the folder where the command was run, and line and column start at 1, so the terminal and VS Code turn the position into a clickable link. Properties are always in CSS form (`margin-bottom`), even when written as `marginBottom` in JSX.

Combining with other terminal commands:

```bash
tokentidy check ./src | awk -F'\t' '$2 == "color"'            # colors only
tokentidy check ./src | cut -f4 | sort | uniq -c | sort -rn  # most repeated values (token candidates)
tokentidy check ./src | wc -l                                # how many hardcoded values
```

**What is reported** (the second column):

| Type | Properties | Values |
|---|---|---|
| `color` | `color`, `background*`, `border*-color`, `outline*`, `fill`, `stroke`, `text-decoration*` and others | Any color syntax: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`… A color function counts as one value |
| `spacing` | `margin*`, `padding*` (including logical ones), `gap`, `row-gap`, `column-gap` | Lengths in `px`, `rem`, `em`, `pt` |
| `size` | `width` and `height` with the **same value** in the same rule (icon, avatar) | Lengths |
| `container` | `width`, `max-width`, `inline-size` of a horizontally centered block (`margin: 0 auto`) | Lengths |
| `radius` | `border-radius` and each corner | Lengths and `%` |
| `border-width` | `border*-width`, and the width in `border`, `outline` | Lengths |
| `font-family` | `font-family`, and the family in `font` | The whole font list, unless it has only generic families |
| `font-size`, `font-weight`, `line-height` | their properties, and their position in the `font` shorthand | Lengths, `bold`, numbers (`700`, `1.5`) |
| `letter-spacing` | `letter-spacing` | Lengths (with the sign) |
| `shadow` | `box-shadow`, `text-shadow` | The whole shadow (all layers) as one value |
| `opacity` | `opacity`, `fill-opacity`… | Numbers and `%` between 0 and 1 |
| `duration`, `easing` | `transition*`, `animation*` | `s`/`ms` and `cubic-bezier()` |
| `z-index` | `z-index` | Integers from 2 up (or -2 down) |

In shorthands, each part is a finding (`margin: 4px 8px` produces two; `border: 1px solid #ddd` produces a `border-width` and a `color`). Values inside functions like `calc()`, gradients and Sass/Less color functions (`darken(#4f46e5, 10%)`) are analyzed too.

**What is not reported (yet):**

- Values that already use a token: `var(--x)` (including the fallback in `var(--x, 12px)`), `$x` and `@x`. A shadow with `var()` in any layer.
- Token definitions themselves: `--color: #fff`, `$color: #fff`, `@color: #fff`.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, percentages and viewport units (`%`, `vw`, `vh`), `z-index` of `-1`, `0` and `1`.
- `width`/`height` without context (a lone `width: 300px` is ambiguous).
- SCSS interpolation (`#{...}`), `@include` parameters, Less mixin calls and comments.
- Style objects outside `style={{}}` (`const styles = { gap: 12 }`), CSS-in-JS (styled-components) and Vue/Svelte files.

If a file has a syntax error, it's reported on `stderr` and the other files are still analyzed:

```
src/broken.css:2:14	syntax error	Missed semicolon
```

If the directory doesn't exist, it shows `Error: Directory not found`; if the path is a file, it shows `Error: Not a directory`.

### 🟢 `tokentidy check <dir> --json`

Does the same as `check`, but prints the result as JSON, for another program to read (a script, CI, another tool).

```json
{
  "root": "/home/you/todo-list-react",
  "filesAnalyzed": 7,
  "findings": [
    {
      "file": "src/App.jsx",
      "line": 29,
      "column": 28,
      "offset": 795,
      "endOffset": 802,
      "type": "color",
      "property": "color",
      "value": "#4f46e5",
      "host": "jsx",
      "selector": "h1"
    }
  ],
  "errors": [],
  "definitions": [{ "name": "$roxo", "syntax": "scss-variable", "value": "#4f46e5", "file": "src/App.scss", "line": 2, "column": 1 }],
  "references": [{ "name": "$roxo", "property": "accent-color", "file": "src/App.scss", "line": 16, "selector": ".tarefa input[type=\"checkbox\"]" }],
  "styleLanguages": ["css", "scss"],
  "tokenFiles": []
}
```

- `file` is relative to `root` and always uses `/`, including on Windows.
- `offset` and `endOffset` mark the exact slice of the value in the file (starting at 0, exclusive end), in every host. That's what autofix will use to replace only the value.
- `host` says where the value was written (`css`, `scss`, `sass`, `less`, `html`, `jsx`, `angular-template`). `selector` is the CSS selector, or `tag.class` for inline styles.
- Optional fields: `atRules` (e.g. `@media (...)` around the rule), `function` (the function around the value, e.g. `darken`), `impliedUnit` (`px` for `padding: 8` in JSX, `rem` for `[style.gap.rem]`).
- `definitions` and `references` are the tokens the project already defines and uses; `tokenFiles` are files dedicated to tokens; `rootFontSize` appears when the project sets `html { font-size }`.
- `errors` lists files with syntax errors (`file`, `line`, `column`, `message`).
- While the version is 0.x, the format may change.

### 🟢 `tokentidy generate <dir>`

Turns the **repeated** hardcoded values into design tokens and writes them to `design-tokens/` inside the project:

| File | When |
|---|---|
| `tokens.tokens.json` | Always. The source of truth, in the [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) format |
| `tokens.css` | Always. `:root { --x: ... }`, generated from the JSON |
| `_tokens.scss` | When the project has `.scss` or `.sass` files |
| `_tokens.less` | When the project has `.less` files |
| `css/<category>.css` + `README.md` | When there are more than `splitThreshold` tokens (default 60): `tokens.css` becomes an index with `@import` |

```bash
tokentidy generate .
tokentidy generate . --dry-run            # print the files, write nothing
tokentidy generate . --min-occurrences 3  # stricter threshold
```

`stdout` lists the files written; the summary goes to `stderr`:

```
design-tokens/tokens.tokens.json
design-tokens/tokens.css
design-tokens/_tokens.scss
7 new tokens, 0 kept, 0 semantic aliases
16 values used fewer than 2 times were not turned into tokens
suggestion	spacing	10px is off the 4px grid (nearest: 8px or 12px)
```

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

How it decides:

- **Threshold:** a value becomes a token only when it appears at least `minOccurrences` times (default 2) in the same token type.
- **Grouping:** different spellings of the same value become one token (`#FFF`, `white` and `rgb(255 255 255)`; `12pt` and `16px`; `.2s` and `200ms`; `bold` and `700`). Close values (`15px` and `16px`) and `px`/`rem` (`16px` and `1rem`) are **not** merged.
- **Roles:** the same value as `spacing`, `font-size` and `line-height` becomes three tokens.
- **Existing tokens:** if the project already has a token for the value that works everywhere it's used (a CSS custom property), it is reused and listed (`N values already have a token in the project`). If the existing token doesn't work in some place (a `$scss` variable, but the value is also used in JSX or an Angular template), a CSS token is created even for a single use, and the SCSS variable is recorded as its equivalent.
- **Names:** spacing and sizes on the grid (`spacing-2` = 8px with `gridBase` 4; `spacing-2_5` = 10px), Tailwind-like scales where the value matches (`radius-lg`, `font-size-base`, `shadow-md`, `container-md`), colors by hue family and lightness (`color-indigo-600`, `color-gray-400`, `color-black-a50`), otherwise the number itself (`font-size-13`).
- **Semantic aliases:** when the role of a color is unambiguous (property + selector words + state), an alias pointing to the primitive is added: `--color-text-danger: var(--color-red-500)`. Turn off with `"semanticTokens": false`.
- **Suggestions** (only printed): spacing/sizes off the grid, and the same size written in `px` and `rem`.
- **Order:** by category, and from smallest to largest inside it. The same project always produces the same files.

Each token in the JSON keeps, in `$extensions["dev.tokentidy"]`, its normalized `key`, `count`, `spellings`, `equivalents` and every **occurrence** (file, line, column, offset, endOffset, property, host, selector…). That's what autofix will use.

**Existing token files.** If the project already has token files (`*.tokens.json`, the output folder, a stylesheet that only defines variables), `generate` needs a decision:

| Flag | What it does |
|---|---|
| `--extend` | Reuses the existing tokens, keeps the names generated before and adds the new ones |
| `--new` | Ignores existing tokens and regenerates from scratch (deletes only the files TokenTidy generates in the output folder) |
| none, in a terminal | Asks: `Extend them (e) or start over (n)? [e/n]` |
| none, outside a terminal (CI, hook, pipe) or with `--json` | Exits with `2`: `Use --extend to reuse them or --new to start over.` |
| `--dry-run` without a flag | Shows what `--extend` would produce |

**Options:**

| Option | What it does |
|---|---|
| `--min-occurrences <n>` | Uses needed for a value to become a token (minimum 2) |
| `--out <dir>` | Output folder (default `design-tokens` inside the project) |
| `--config <file>` | Config file (default `tokentidy.config.json` in the project) |
| `--extend` / `--new` | See above |
| `--dry-run` | Prints each file (`==> file <==` + content, like `head`) instead of writing |
| `--json` | Prints the result as JSON (below) |

Exit code `0`, `1` if a file has a syntax error (the token set may be incomplete), `2` for a usage or config error.

### 🟢 `tokentidy generate <dir> --json`

The same result as JSON: `root`, `filesAnalyzed`, `mode` (`extend`/`new`), `config` (the values in effect), `dryRun`, `files` (paths written or that would be written), `tokens` (each with `path`, `name`, `type`, `key`, `value`, `count`, `spellings`, `occurrences`, and `equivalents`/`kept` when they apply), `aliases`, `reused`, `belowThreshold` (values under the threshold, with their occurrences), `suggestions` (`kind`, `type`, `message`, `values`), `rootFontSize` and `errors`.

### 🟢 Configuration file: `tokentidy.config.json`

Optional, at the root of the analyzed project (or another path with `--config`). Priority: command-line option > config file > default.

```json
{
  "minOccurrences": 2,
  "gridBase": 4,
  "rootFontSize": 16,
  "output": "design-tokens",
  "splitThreshold": 60,
  "semanticTokens": true
}
```

| Key | Default | What it does |
|---|---|---|
| `minOccurrences` | `2` | Uses needed for a value to become a token (integer, at least 2) |
| `gridBase` | `4` | Spacing grid in px: names the scale and decides what is off the grid |
| `rootFontSize` | detected from `html { font-size }`, or `16` | px per `rem`, to compare `rem` with `px` |
| `output` | `design-tokens` | Output folder, relative to the project |
| `splitThreshold` | `60` | From how many tokens the CSS is split into one file per category |
| `semanticTokens` | `true` | Generate semantic aliases (`color-text-danger`) |

An unknown key, a wrong type or invalid JSON stops with exit code `2` and a message naming the key, instead of being silently ignored.

### 🟢 `tokentidy` (no arguments) or `tokentidy --help`

Shows the "TokenTidy" banner, the list of commands, the options and usage examples. Also works for a specific command:

```bash
tokentidy --help
tokentidy check --help
tokentidy generate --help
```

### 🟢 `tokentidy --version`

Shows the tool version, read from the `version` field in `package.json`. Shortcut: `tokentidy -V`.

---

## Planned commands

| Command | Phase | What it will do |
|---|---|---|
| ⚪ `tokentidy fix <dir> --dry-run` | 7 | Show, as a diff, what autofix would replace, without changing any file. **Next step** |
| ⚪ `tokentidy fix <dir>` | 7 | Replace each occurrence recorded by `generate` with its token: `var(--x)` in CSS and inline styles, `$x`/`@x` inside Sass/Less functions, `'var(--x)'` in JSX numbers. The name (`fix` or `check --fix`) is still open |
| ⚪ `tokentidy check <dir> --tokens <file>` | 5 and 6 | Compare the hardcoded values with an existing DTCG token file and suggest the equal or closest token, explaining why |
| ⚪ `--fix-approximate` | 7 | Also replace values that are only close to a token (e.g. `15px` to the `16px` token) |
| ⚪ More suggestions in `generate` | 6 and 9 | Near-duplicate colors, renaming existing tokens with bad names |
| ⚪ `tokentidy check <dir> --quiet` | 10 | Show only the essentials (useful in CI) |
| ⚪ Ignoring code | 10 | A `/* tokentidy-ignore */` comment and ignored folders/files in `tokentidy.config.json` |

### 🟢 Exit codes

| Code | Meaning |
|---|---|
| `0` | All good: no hardcoded values (`check`), tokens generated (`generate`) |
| `1` | Hardcoded values were found (`check`), or a file has a syntax error |
| `2` | Usage or execution error: missing folder, unknown option, invalid config, existing token files without `--extend`/`--new` outside a terminal |

This is what makes `check` usable in CI and pre-commit hooks: the step fails when a hardcoded value shows up. To see the exit code in the terminal: `tokentidy check ./src; echo $?`.

---

## Development commands

| Command | What it does |
|---|---|
| `npm run dev -- check ./src` | Runs the CLI straight from the TypeScript source, without a build. The `--` separates npm's options from the CLI's |
| `npm test` | Runs the tests in `test/` (`*.test.ts`) |
| `npm run typecheck` | Type-checks `src/` and `test/` without emitting files |
| `npm run check` | Type checking + tests (what CI will run) |
| `npm run build` | Compiles `src/` into `dist/` |
| `npm run build:watch` | Recompiles on every change (useful with `npm link`) |
