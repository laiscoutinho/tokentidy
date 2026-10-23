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

Each line is one value, with five fields separated by tabs:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.jsx:29:72	violation	font-weight/hardcoded	font-weight	bold
src/App.jsx:31:12	review	size/no-context	width	120
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
```

| Field | Example | Meaning |
|---|---|---|
| Position | `src/App.jsx:29:28` | File, line and column (both start at 1). The terminal and VS Code turn it into a clickable link |
| Severity | `violation` | `violation`: should be a token. `review`: needs a human decision |
| Rule | `color/hardcoded` | What was found ([Rules](rules.md)) |
| Property | `color` | Always in CSS form (`margin-bottom`), even when written `marginBottom` in JSX |
| Value | `#4f46e5` | The value as written |

The path is relative to the folder where you ran the command. The summary goes to the error output, so the data stays clean for scripts:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

Violations make `check` end with exit code `1`; review items never do ([Exit codes](exit-codes.md)).

## Where it looks

| Host | Files | What is read |
|---|---|---|
| `css` | `.css`, `<style>` in `.html` | every declaration |
| `scss` | `.scss`, Angular `styles:` | every declaration; `$variables` are tokens |
| `sass` | `.sass` (indented syntax) | every declaration; `$variables` are tokens |
| `less` | `.less` | every declaration; `@variables` are tokens, mixin calls are skipped |
| `html` | `.html` | inline `style="..."` |
| `jsx` | `.jsx`, `.tsx`, `.js`, `.ts` | `style={{ ... }}` (camelCase, and numbers as px: `padding: 8`) |
| `angular-template` | Angular `template:` and the `.html` of `templateUrl` | `style="..."`, `[style.padding.px]="4"`, `[ngStyle]="{...}"` |

`.pcss`/`.postcss` files are read as CSS. Token files (`*.tokens.json`) are read as the project's existing tokens, not as code.

## What it skips

Inside folders, it skips `node_modules`, `dist`, `build`, `.git`, `coverage`, `.angular`, `.next`, `.nuxt`, `out`, hidden folders, folders that are symbolic links, and `.d.ts`, `*.spec.*`, `*.test.*` and `*.stories.*` files.

**Files are listed, never silently dropped.** Minified files (named `*.min.*`, or with an average line longer than 110 characters) and languages TokenTidy doesn't read yet (`.vue`, `.svelte`, `.styl`, `.stylus`) are listed on the error output:

```
src/App.vue	skipped	unsupported
```

To analyze minified files too, set `"includeMinified": true`; to skip your own files or folders, use `ignore` ([Configuration](configuration.md)). To accept one value on purpose, use an [ignore comment](ignore-comments.md).

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

## See also

- [Rules](rules.md): what each rule means and what is not reported
- [Scripts and CI](ci-and-scripts.md): filtering the result and failing a build
