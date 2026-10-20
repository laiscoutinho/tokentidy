# TokenTidy commands

This file lists every TokenTidy command: the ones that already work and the ones planned in the [development guide](development-guide.md). Update it whenever a new command is implemented.

**Legend:** 🟢 Works · ⚪ Planned (the name may change)

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
# 1. At the tokentidy/ root: builds and creates tokentidy-0.0.2.tgz
npm pack

# 2. In the lab, create the version folder and install the package as a dev dependency
mkdir -p ../tcc-labs/testar-tokentidy/v0.0.2
mv tokentidy-0.0.2.tgz ../tcc-labs/testar-tokentidy/v0.0.2/
cd ../tcc-labs/testar-tokentidy/v0.0.2
npm init -y && npm install -D ./tokentidy-0.0.2.tgz

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

Analyzes the directory's `.css` and `.scss` files and lists the **hardcoded values**: colors, spacing and typography written straight into the code instead of using a token. `.jsx`, `.tsx` and `.html` files are found, but are only analyzed starting in Phases 3 and 4.

Ignores the `node_modules`, `dist`, `build`, `.git` and `coverage` folders, plus hidden folders (`.angular`, `.next`...).

```bash
tokentidy check ./src           # relative folder
tokentidy check .               # current folder
tokentidy check ~/projects/app  # absolute path
```

The output is only the data, one hardcoded value per line, with four tab-separated fields: position (`file:line:column`), category (`color`, `spacing` or `typography`), property and value.

```
src/App.scss:2:10	color	color	#ff0000
src/components/Button.css:2:12	spacing	padding	12px
src/components/Button.css:3:14	typography	font-size	14px
```

The path is relative to the folder where the command was run, and line and column start at 1. That's why the terminal and VS Code turn the position into a clickable link.

Combining with other terminal commands:

```bash
tokentidy check ./src | grep color                           # colors only
tokentidy check ./src | cut -f4 | sort | uniq -c | sort -rn  # most repeated values (token candidates)
tokentidy check ./src | wc -l                                # how many hardcoded values
```

**What is reported:**

| Category | Properties | Values |
|---|---|---|
| `color` | `color`, `background*`, `border*` (color), `outline*`, `box-shadow`, `text-shadow`, `fill`, `stroke` and others | Any color syntax: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`... A color function counts as a single value |
| `spacing` | `margin*`, `padding*` (including logical ones, like `padding-inline`), `gap`, `row-gap`, `column-gap` | Lengths in `px`, `rem`, `em` and `pt` |
| `typography` | `font-size`, `line-height`, `letter-spacing`, `font-weight`, `font-family`, `font` | Lengths, numbers (`1.5`, `700`), `bold` and the whole font list |

In shorthands, each part is a finding (`margin: 4px 8px` produces two). Values inside functions like `calc()` and gradients are analyzed too.

**What is not reported (yet):**

- Values that already use a token: `var(--x)` (including the fallback in `var(--x, 12px)`) and SCSS variables `$x`.
- Token definitions themselves: `--color: #fff` and `$color: #fff`.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, percentages and viewport units (`%`, `vw`, `vh`).
- SCSS interpolation (`#{...}`), `@include` parameters and comments.
- Properties outside the three categories, like `width` and `border-radius`.

Fallback values, relative units and properties like `width` are planned: they need the context of the value to avoid false positives (see the [README](../README.md#-what-makes-it-different-context)).

If a file has a syntax error, it's reported on `stderr` and the other files are still analyzed:

```
src/broken.css:2:14	syntax error	Missed semicolon
```

If the directory doesn't exist, it shows `Error: Directory not found`; if the path is a file, it shows `Error: Not a directory`.

### 🟢 `tokentidy check <dir> --json`

Does the same as `check`, but prints the result as JSON. Useful for another program to read the result (a script, CI, another tool).

```json
{
  "root": "/home/you/project/src",
  "filesAnalyzed": 2,
  "findings": [
    {
      "file": "App.scss",
      "line": 2,
      "column": 10,
      "offset": 16,
      "endOffset": 23,
      "kind": "color",
      "property": "color",
      "value": "#ff0000"
    }
  ],
  "errors": []
}
```

- `file` is relative to `root` and always uses `/`, including on Windows.
- `offset` and `endOffset` mark the exact slice of the value in the file (starting at 0, with an exclusive end). That's what autofix will use to replace only the value.
- `errors` lists files with syntax errors (`file`, `line`, `column`, `message`).
- While the version is 0.x, the format may change.

```bash
tokentidy check ./src --json
tokentidy check ./src --json > result.json   # save to a file
```

### 🟢 `tokentidy` (no arguments) or `tokentidy --help`

Shows the "TokenTidy" banner, the list of commands, the options and usage examples. Also works for a specific command:

```bash
tokentidy --help
tokentidy check --help
```

### 🟢 `tokentidy --version`

Shows the tool version, read from the `version` field in `package.json`. Shortcut: `tokentidy -V`.

---

## Planned commands

| Command | Phase | What it will do |
|---|---|---|
| ⚪ `tokentidy check <dir>` on JSX/TSX and Angular | 3 and 4 | Also list hardcoded values in React `style={{...}}` (Phase 3) and in Angular components and templates (Phase 4). CSS/SCSS already works |
| ⚪ `tokentidy check <dir> --tokens <file>` | 5 and 6 | Read a DTCG token file and suggest, for each hardcoded value, the equal or closest token, explaining why |
| ⚪ `tokentidy check <dir> --dry-run` | 7 | Show what autofix would replace, without changing any file |
| ⚪ `tokentidy check <dir> --fix` | 7 | Replace hardcoded values with tokens in the files (e.g. `#ff0000` becomes `var(--color-danger)`). By default, only replaces values identical to a token |
| ⚪ `tokentidy check <dir> --fix-approximate` | 7 | Also replace values that are only close to a token (e.g. `15px` to the `16px` token) |
| ⚪ `tokentidy generate <dir>` | 9 | For projects without a token file: group repeated values and generate a token file with semantic names. By default, only shows the result; writes only on confirmation or with a flag |
| ⚪ `tokentidy check <dir> --quiet` | 10 | Show only the essentials (useful in CI) |
| ⚪ Configuration file | 10 | Save the token path, extensions, tolerances and ignored folders in the project, so flags don't need repeating |

### 🟢 Exit codes

| Code | Meaning |
|---|---|
| `0` | All good, no hardcoded values found |
| `1` | Hardcoded values were found, or a file has a syntax error |
| `2` | Usage or execution error (missing folder, unknown option, invalid token file…) |

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
