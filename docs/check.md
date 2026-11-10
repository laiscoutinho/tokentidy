# The `check` command

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/check.md).

`check` analyzes the project and lists the **hardcoded values**: visual values written straight into the code instead of using a token. It never changes a file.

```bash
npx tokentidy check                           # current folder
npx tokentidy check src/components            # one folder
npx tokentidy check src/Card.css src/App.tsx  # specific files
npx tokentidy check ~/projects/app            # absolute path
```

## Reading the result

Each line is one value, with five fields separated by tabs, and a sixth when a token fits the value:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.jsx:29:72	violation	font-weight/hardcoded	font-weight	bold
src/App.jsx:31:12	review	size/no-context	width	120
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
src/Card.css:4:12	violation	color/hardcoded	color	#4f46e5	--color-primary
```

| Field | Example | Meaning |
|---|---|---|
| Position | `src/App.jsx:29:28` | File, line and column (both start at 1). The terminal and VS Code turn it into a clickable link |
| Severity | `violation` | `violation`: should be a token. `review`: needs a human decision |
| Rule | `color/hardcoded` | What was found ([Rules](rules.md)) |
| Property | `color` | Always in CSS form (`margin-bottom`), even when written `marginBottom` in JSX |
| Value | `#4f46e5` | The value as written |
| Token | `--color-primary` | Optional: the token for this value ([below](#which-token-fits)) |

The path is relative to the folder where you ran the command. The summary goes to the error output, so the data stays clean for scripts:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

Violations make `check` end with exit code `1`; review items never do ([Exit codes](exit-codes.md)).

With several apps in one repository, `check` also compares them: see [Micro-frontends](micro-frontends.md).

## Which token fits

`check` looks up each violation among the tokens the project defines and the ones in the tokens folder (`design-tokens/`, or `output` in the config). It uses the same decision as `fix`, so it never names a token `fix` would not use. It only reads: to apply the change, run [`fix`](fix.md).

| Sixth field | Meaning | `fix` replaces it? |
|---|---|---|
| `--color-primary` | Same value, and this token works in this file | Yes |
| `--a-gap (or --b-gap)` | Two tokens with the same value, used equally: you pick | No, it is skipped as `ambiguous-token` |
| `--spacing-4 (+1px)` | No token has this value, but `15px` is off the grid and one on the grid is 1px away | No |
| `--brand (ΔE 0.012)` | No token has this color, but one is almost the same (ΔEOK up to 0.02) | No |

Tokens can come from more places than your own stylesheets:

| Source | Example | Sixth field |
|---|---|---|
| A design-system package your styles load from `node_modules` (`@use "@acme/tokens" as *;`, `@import`) | `$brand: #4f46e5;` in the package | `$brand` |
| A JS theme (`createTheme({...})`, `<ThemeProvider theme={...}>`), string values only | `palette: { primary: { main: '#0ea5e9' } }` | `theme.palette.primary.main`: only a hint, `fix` doesn't write theme paths |
| A hand-written DTCG file (`*.tokens.json`) | `color.primary` | `--color-primary` |

Only the definitions of a package are read: its own CSS isn't your code, so nothing in it is reported.

When a value already uses a primitive token but a semantic alias exists for that role, a `suggestion` line points to the alias. It never fails, and `fix` doesn't change existing references:

```
src/b.css:2:21	suggestion	token/prefer-alias	color	--color-red-500	--color-text-danger
```

A value that is close is only a hint: looking similar doesn't make it the same design decision. To replace close values, use [`fix --approximate`](fix.md#values-close-to-a-token---approximate), which asks first and checks the coherence guards. Measures are only compared when they are off the grid (`gridBase` in the config), so `16px` next to a `12px` token suggests nothing. Two tokens at the same distance suggest nothing either.

When the tokens folder exists and repeated values have no token, the summary says so, because the code changed after `generate`:

```
2 repeated values have no token yet; run tokentidy generate --extend
```

## Warnings about tokens

These go to the error output, in the same `file:line:column` format, and never change the exit code.

| Rule | When | Example |
|---|---|---|
| `token/unknown` | A `var(--x)` names a custom property nobody defines, and exactly one defined name is at most 2 letters away | `--color-primry is not defined; did you mean --color-primary?` |
| `token/deprecated` | A token marked `$deprecated` in a DTCG file is used. `fix` never writes it | `--color-old is deprecated: use color.new` |
| `token/fallback-mismatch` | The fallback in `var(--gap, 12px)` differs from every value of the token, so the screen changes if the token doesn't load | `fallback 12px differs from --gap (16px, tokens.css:1)` |
| `baseline/stale` | The [baseline](#adopting-it-in-a-project-that-already-has-violations) lists values a file no longer has | `2 baselined values are no longer here; …` |

Only `--x` names are checked for typos: a missing `$x` or `@x` already breaks the build, and loop variables would look unknown. Several close names mean a scale (`--spacing-4`, `--spacing-6`), not a typo, so nothing is said.

On a run over the whole project, the summary also counts the custom properties nobody uses (`--json` lists them in `unusedTokens`). They are never an error: a token can be used from outside the analyzed files. Sass and Less variables are not counted, because they can be used in places TokenTidy doesn't read yet, such as `@include` arguments.

## Adopting it in a project that already has violations

A baseline is a photo of the current violations, so CI only fails on new ones.

```bash
npx tokentidy check --print-baseline > tokentidy.baseline.json   # exits with 0
npx tokentidy check --baseline tokentidy.baseline.json           # fails only on what is new
```

The file counts violations per file, rule, property and normalized value, with no line numbers: adding a line above a value or moving a block changes nothing. A third `margin: 13px` in a file whose baseline has two is new. When values are gone, a `baseline/stale` warning tells you to refresh the file. `generate` and `fix` ignore the baseline.

## How far along is the project

`tokentidy check --summary` prints one line per token type, tab-separated: type, values still hardcoded, uses of a token.

```
color	12	87
spacing	40	15
```

They stay as two numbers on purpose: one overall score would hide that colors are done and spacing isn't. The count includes what the baseline hides, because accepting a debt doesn't remove it. It needs the whole project, so it can't be combined with paths. The exit code is the same as without the flag.

## Where it looks

| Host | Files | What is read |
|---|---|---|
| `css` | `.css`, `<style>` in `.html` | every declaration |
| `scss` | `.scss`, Angular `styles:` | every declaration; `$variables` are tokens; `@include` arguments, `@mixin` defaults and `mat.*-overrides` maps |
| `sass` | `.sass` (indented syntax) | every declaration; `$variables` are tokens; `@include` arguments and `@mixin` defaults |
| `less` | `.less` | every declaration; `@variables` are tokens, mixin calls are skipped |
| `html` | `.html` | inline `style="..."` |
| `jsx` | `.jsx`, `.tsx`, `.js`, `.ts`, `.mjs`, `.cjs`, `.mts`, `.cts` | `style={{ ... }}` and objects that reach it (`style={card}`, also from a relative import), `css={{ }}`, `styled.div({ })`, MUI `sx`, `el.style.x`, `setProperty`, `cssText`, `setAttribute`, `Object.assign(el.style, ...)`, `@HostBinding`, `Renderer2.setStyle` |
| `angular-template` | Angular `template:`, the `.html` of `templateUrl` and `host:` | `style="..."`, `[style.padding.px]="4"`, `[ngStyle]="{...}"` |
| `css-in-js` | The same script files | Tagged templates: `styled.x`, `css`, `keyframes`, `createGlobalStyle`, `injectGlobal`, and the `css` prop with a template. A value with `${...}` inside it is not reported |
| `svg-attribute` | The same script files | SVG presentation attributes in JSX (`fill`, `stroke`, `stopColor`, `floodColor`, `lightingColor`) and `setAttribute('fill' or 'stroke', ...)`. `fix` leaves them alone |
| `js-value` | The same script files | Colors read by JavaScript: `ctx.fillStyle`, `new Chart`/`new ApexCharts` options, and color keys in objects passed to unknown functions. `fix` writes them from the [`tokens.ts` module](fix.md#canvas-and-charts-the-tokensts-module) |

`.pcss`/`.postcss` files are read as CSS. As in TypeScript itself, JSX inside a `.ts` file is a syntax error. Token files (`*.tokens.json`) are read as the project's existing tokens, not as code.

## What it skips

Inside folders, it skips `node_modules`, `dist`, `build`, `.git`, `coverage`, `.angular`, `.next`, `.nuxt`, `out`, hidden folders, folders that are symbolic links, and `.d.ts`, `*.spec.*`, `*.test.*` and `*.stories.*` files.

**Files are listed, never silently dropped.** Minified files (named `*.min.*`, or with an average line longer than 110 characters) and languages TokenTidy doesn't read yet (`.vue`, `.svelte`, `.styl`, `.stylus`) are listed on the error output:

```
src/App.vue	skipped	unsupported
```

To analyze minified files too, set `"includeMinified": true`; to skip your own files or folders, use `ignore` ([Configuration](configuration.md)). To accept one value on purpose, use an [ignore comment](ignore-comments.md).

## Analyzing part of a project

Violations are reported only for the paths you give. Everything that decides those violations comes from the **whole project**: where tokens are defined and used, and which `.html` files are Angular templates. So `check src/a` and `check .` agree about the files in `src/a`.

Reading the rest of the project costs about the same as a full run, without printing it. In `--json`, `partial` is `true` on these runs.

## Project root

The paths can be files or folders. TokenTidy finds the **project root**: the nearest folder above them with `package.json`, `tokentidy.config.json` or `.git`. It reads the config from there.

- A file named explicitly is analyzed even if a folder scan would skip it (`Button.test.tsx`).
- A path that doesn't exist stops with `Error: Path not found: <path>` and exit code `2`.
- A path with nothing to analyze prints `No supported files in <path>` and exits with `0`.

## Files with errors

A file with a syntax error is reported on the error output, and the other files are still analyzed:

```
src/broken.css:2:14	syntax error	Missed semicolon
```

## Safe output

Values, paths and messages in the text output have control characters escaped (`\u001b`), so a file can't move the cursor or fake a link in your terminal. `--json` keeps the exact text.

## Options

| Option | What it does |
|---|---|
| `--json` | Prints the result as JSON ([JSON output](json-output.md)) |
| `--config <file>` | Config file (default: `tokentidy.config.json` at the project root) |
| `--baseline <file>` | Only report violations that are not in this baseline file |
| `--print-baseline` | Print a baseline of the current violations to the standard output and exit with `0` |
| `--summary` | Instead of the list: per token type, how many values are hardcoded and how many uses go through a token (see [above](#how-far-along-is-the-project)) |
| `--format <format>` | `text` (default) or `github`: annotations for [GitHub Actions](ci-and-scripts.md#annotations-on-the-pull-request) |

## See also

- [Rules](rules.md): what each rule means and what is not reported
- [Scripts and CI](ci-and-scripts.md): filtering the result and failing a build
