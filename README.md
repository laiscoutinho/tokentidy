# 🧹 TokenTidy

A command-line tool built as my **undergraduate capstone project (TCC)** to help keep front-end code **faithful to the design system**. It finds hardcoded visual values in the code (such as `#4f46e5`, `17px` or `font-family: Arial`), points out which **design token** should be used instead, fixes the code safely and, when the project has no tokens yet, helps create them.

> ⚠️ Work in progress (version `0.0.x`: each feature is a patch release; `0.1.0` will be the first with every planned feature). Today the CLI finds hardcoded values in CSS, SCSS, Sass, Less, HTML, React (JSX/TSX) and Angular, and generates design tokens (DTCG + CSS/SCSS/Less) from the repeated ones. Automatic fixes are next. See the [roadmap](#️-roadmap).

---

## Contents

- [The problem](#-the-problem)
- [What design tokens are](#-what-design-tokens-are)
- [The proposal](#-the-proposal)
- [What makes it different: context](#-what-makes-it-different-context)
- [Scope](#-scope)
- [Installation and usage](#-installation-and-usage)
- [How it works](#️-how-it-works)
- [Related work](#-related-work)
- [Methodology](#-methodology)
- [Roadmap](#️-roadmap)
- [Repository structure](#-repository-structure)
- [Development](#️-development)
- [About the TCC](#-about-the-tcc)
- [License](#-license)

---

## ❓ The problem

In almost every front-end project, the design starts organized and slowly drifts:

- The same color shows up written five different ways (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…)
- "Almost equal" spacing values appear, like `10px`, `11px` and `12px`, that should be a single one
- Styles end up scattered across CSS, SCSS, inline styles and components
- When the design changes (e.g. the primary color), the value has to be hunted down and replaced by hand in many files

The result is an **inconsistent** interface and code that is **hard to maintain**. Traditional linters (ESLint, Stylelint) check whether the code is well written, but **they don't know whether it follows the design system**. And many projects **never had tokens at all**: building a set from scratch out of existing code is slow and manual.

---

## 🎨 What design tokens are

**Design tokens** are the visual decisions of a design system stored as named data: colors, spacing, typography, borders, shadows and so on. Instead of writing the value directly, the code references the token:

```css
/* ❌ Hardcoded value */
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

Tokens can be **primitive** (`--color-indigo-600: #4f46e5`) or **semantic** (`--color-primary: var(--color-indigo-600)`), and they are exported in formats shared by designers and developers, such as [DTCG](https://www.designtokens.org/) (W3C Design Tokens Community Group).

Changing the primary color then means editing **a single place**.

---

## 💡 The proposal

**TokenTidy** tackles two problems: **detecting and fixing drift** where a standard already exists, and **helping create the standard** where it doesn't exist yet.

| Step | What it does |
|---|---|
| 🔍 **Detect** | Scans the project and finds hardcoded visual values (colors, spacing, sizes, radius, typography, shadows, motion…), with file, line and column |
| 🎯 **Suggest** | Compares each value with the project's tokens and points to the exact or closest token, explaining the choice |
| 🔁 **Fix** | Replaces values with tokens by editing only the necessary slice, with a preview (`--dry-run`) and, by default, only for exact matches |
| 🏷️ **Generate** | When the project has no tokens, groups repeated values and proposes a token file with semantic names |
| 🛡️ **Verify** | Predictable output, `--json` and dedicated exit codes to run in CI and pre-commit hooks |

Principles: nothing is changed without an explicit request, every suggestion comes with a reason, the same input always produces the same output, and a broken file never stops the analysis of the others. The tool collects no usage data and sends nothing off your machine.

---

## 🧠 What makes it different: context

A value alone doesn't say whether it should be a token. TokenTidy's goal is to understand **what the value is doing** before suggesting anything:

- **The same value can mean different things.** `width: 800px` that sets the maximum width of the page content on every screen is a layout decision, and a token candidate (e.g. `--layout-max-width`). The same `800px` setting the width of a card is a different decision, and shouldn't be merged with the first one just because the number is equal.
- **Different values can mean the same thing.** A `max-width` repeated across page containers with slightly different values is probably one decision written several ways. Pointing that out helps the user decide whether it should become a single token.
- **Context comes from the code itself:** the property, the selector and where it's used, which other declarations sit next to it, and how often the value repeats in the same role.

This is what lets TokenTidy go beyond "this is a hardcoded value" and explain *why* something should (or shouldn't) become a token.

---

## 🧭 Scope

| Analyzes | Out of scope (by design) |
|---|---|
| CSS, SCSS, Sass (indented) and Less | Tailwind and other utility-class approaches |
| React inline styles (`style={{...}}` in JSX/TSX) | CSS-in-JS libraries |
| Angular: component styles, style files and templates (`[style.x]`, `[ngStyle]`) | Dynamic styles computed only at runtime |
| HTML (`<style>` and `style=""`) | Artificial intelligence and external services |
| Design token files in the [DTCG](https://www.designtokens.org/) format | |

Files considered: `.css`, `.scss`, `.sass`, `.less`, `.html`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx` and `*.tokens.json`. Folders like `node_modules`, `dist`, `build`, `.angular` and `.next`, plus type declarations, tests, stories and minified files, are ignored.

---

## 🚀 Installation and usage

Requirement: **Node.js 22.20 or later**.

The package is not on npm yet, so install it straight from GitHub as a dev dependency of your project:

```bash
npm install -D github:laiscoutinho/tokentidy
npx tokentidy --help
```

### Available commands

```bash
tokentidy check                # list hardcoded values in the current project
tokentidy check src/Card.css   # only some files or folders
tokentidy check --json         # the same result as JSON, for scripts and CI
tokentidy generate .           # turn repeated values into tokens in design-tokens/
tokentidy generate . --dry-run # show the token files without writing them
tokentidy --version
```

`check` follows the UNIX philosophy: only data on `stdout`, one item per line (`file:line:column`, severity, rule, property and value, tab-separated), and the summary on `stderr`. That makes it work with other terminal tools:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.jsx:29:93	violation	spacing/hardcoded	margin-bottom	24
src/App.jsx:31:12	review	size/no-context	width	120
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
```

```bash
tokentidy check ./src | awk -F'\t' '$3 == "color/hardcoded"'  # colors only
tokentidy check ./src | cut -f5 | sort | uniq -c | sort -rn    # most repeated values
```

*Review* items are what the code alone can't decide (a lone `width: 120px`): they are shown but never fail CI. An intentional value is ignored with its rule and a reason: `/* tokentidy-ignore-line color/hardcoded -- partner brand */`.

`generate` writes `tokens.tokens.json` (DTCG) and `tokens.css`, plus `_tokens.scss`/`_tokens.less` when the project uses them. A value becomes a token when it is used at least twice (configurable in `tokentidy.config.json`); tokens the project already has are reused; names follow familiar scales (`spacing-2`, `radius-lg`, `color-indigo-600`). It also prints a diagnosis of each scale (how many different values, how many uses already fall on a token). Files are written atomically, only inside the project, and never over a file TokenTidy didn't generate.

Exit code: `0` ok, `1` hardcoded values found (or a file with a syntax error), `2` usage error. Errors go to `stderr`. The full list of commands, options and configuration is in [docs/commands.md](docs/commands.md).

---

## ⚙️ How it works

```
  Project code
        │
        ▼
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Read the │ ──▶ │ 2. Understand│ ──▶ │ 3. Compare   │
 │  project     │     │ the code(AST)│     │ with tokens  │
 └──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ 4. Report,   │
                                           │ suggest or   │
                                           │ fix          │
                                           └──────────────┘
```

Each file is read through its structure (syntax tree), not through text search. That way the tool tells a color apart from text that only looks like one, and knows the exact position of every value, which makes it possible to fix code without touching the rest of the file.

A finding in `--json`:

```json
{
  "file": "src/App.scss",
  "line": 2,
  "column": 10,
  "offset": 16,
  "endOffset": 23,
  "type": "color",
  "property": "color",
  "value": "#ff0000",
  "host": "scss",
  "selector": ".title"
}
```

---

## 📚 Related work

Before building TokenTidy, existing tools were studied and tested hands-on in [tcc-labs](https://github.com/laiscoutinho/tcc-labs). Each one solves part of the problem:

| Tool | Focus | Strengths | Observed / documented limitations |
|---|---|---|---|
| [**@lapidist/design-lint**](https://github.com/bylapidist/design-lint) | Design system linter | Validates token usage in JS, TS, CSS, SCSS and Less; DTIF token format; `--fix`; CI, LSP and MCP integration | Tokens must already exist; doesn't analyze dynamic expressions in inline styles; indented `.sass` produces a `parse-error`; the background kernel needs care when switching projects |
| [**Design Token Extractor & Migrator**](https://github.com/bobrowsse-tech/design-token-extractor) | Token extraction and migration | Scans CSS, SCSS, Less, Vue, HTML and JS/TS; groups similar values; generates DTCG/Tokens Studio; migration with preview and undo | Focused on a VS Code extension; continuous checking is simpler (`check` against the lockfile) |
| [**stylelint-declaration-strict-value**](https://github.com/AndyOGo/stylelint-declaration-strict-value) | Stylelint rule | Forces variables in chosen properties | Only analyzes stylesheets; doesn't know which tokens exist and doesn't suggest replacements |

TokenTidy builds on these lessons: combine **checking and fixing** with **token generation** for those who don't have a set yet, without background processes, treat **Angular** with the same care as React, and use the **context** of each value to decide what is really a token.

---

## 🔬 Methodology

1. **Literature review** on design systems, design tokens and format standards (DTCG, DTIF)
2. **Experimentation** with existing tools in [tcc-labs](https://github.com/laiscoutinho/tcc-labs), following the flow: choose, configure, run on each base project, record results (including what failed) and conclude
3. **Gap analysis**: what no tool covers well (e.g. projects without tokens, inline CSS, Angular, the context of a value)
4. **Development** of TokenTidy focused on those gaps
5. **Evaluation** of TokenTidy on the base projects, compared with the studied tools by criteria such as:
   - Styling approaches detected
   - Number of hardcoded values found (and false positives/negatives)
   - Quality of token suggestions and automatic fixes
   - Ease of installation, configuration and use

The base projects are the same to-do list app built with plain HTML + JavaScript, React + Vite and Angular, using different styling approaches. They live in [tcc-labs](https://github.com/laiscoutinho/tcc-labs), along with the results of each TokenTidy version (`testar-tokentidy/`).

---

## 🗺️ Roadmap

**Legend:** ⚪ Planned · 🟡 In progress · 🟢 Done

| Step | Status |
|---|---|
| Study of existing tools (design-lint, Design Token Extractor) | 🟢 |
| Scope and architecture definition | 🟢 |
| TypeScript CLI skeleton (`check`, `--json`, tests) | 🟢 |
| Hardcoded value detection in CSS and SCSS | 🟢 |
| Detection in Sass (indented), Less and HTML | 🟢 |
| Detection in React inline styles (JSX/TSX) | 🟢 |
| Detection in Angular components and templates | 🟢 |
| Reading existing tokens (DTCG, CSS custom properties, SCSS/Less variables) | 🟢 |
| Token generation (DTCG + CSS/SCSS/Less, scale names, semantic aliases) | 🟢 |
| Project configuration (`tokentidy.config.json`) | 🟢 |
| Context-aware detection (page container vs. icon size, see [above](#-what-makes-it-different-context)) | 🟡 |
| Automatic fixes (`--fix`, `--dry-run`) | 🟡 next |
| Suggesting the exact or closest token (`check --tokens`) | ⚪ |
| Near-duplicate colors and renaming existing tokens | ⚪ |
| Style objects outside `style={{}}` and CSS-in-JS | ⚪ |
| Mapping `var()` fallback values (e.g. `var(--space, 12px)`) | ⚪ |
| Relative units (`%`, `vw`, `vh`): compare with absolute values used in the same role and unify them into one token | ⚪ |
| Files and folders as input, project root detection | 🟢 |
| Rule ids, *review* items, local custom properties, breakpoints | 🟢 |
| Ignore comments and ignored folders | 🟢 |
| Scale diagnosis in `generate`, safe writing | 🟢 |
| CI usage and npm release | 🟡 CI on Linux/Windows/macOS |
| Comparative evaluation on the base projects | ⚪ |
| Writing the TCC text | ⚪ |

---

## 📁 Repository structure

```
tokentidy/
├── src/
│   ├── cli.ts          # entry point (enables the compile cache and loads program.ts)
│   ├── program.ts      # builds the command-line program
│   ├── cli/            # one module per command, plus output helpers and exit codes
│   ├── index.ts        # public API, to use TokenTidy as a library
│   ├── types.ts        # shared types (e.g. Finding, a hardcoded value found)
│   ├── config.ts       # tokentidy.config.json
│   ├── scope.ts        # paths → project root + files to analyze
│   ├── scanner.ts      # classifies files (supported, token, minified, unsupported)
│   ├── analyze.ts      # ties it together: reads each file and calls the parser for its extension
│   ├── ignore.ts       # tokentidy-ignore comments
│   ├── fs-safe.ts      # atomic writes inside the project
│   ├── rules.ts        # what counts as a violation: properties, units and exceptions
│   ├── position.ts     # converts an offset into line and column
│   ├── parsers/        # CSS/SCSS/Sass/Less, HTML, JSX/TSX, Angular and DTCG
│   ├── suggest/        # value normalization (closest token comes next)
│   ├── generate/       # token generation: grouping, names, semantic aliases, output files
│   ├── tokens/         # token index for check --tokens (planned)
│   └── fix/            # automatic fixes (next)
├── test/               # automated tests and sample projects (fixtures)
└── docs/               # development guide, commands and logs
```

The CLI (`cli.ts`, `program.ts` and `cli/`) only handles input and output; all analysis lives in separate modules that can be tested without a terminal.

---

## 🛠️ Development

Written in **TypeScript** (ESM), with Node.js **22.20 or later**: Node runs the `.ts` files directly, with no build step. The build only happens to produce the package (`dist/`, with JavaScript and types).

```bash
git clone https://github.com/laiscoutinho/tokentidy.git
cd tokentidy
npm install                    # installs dependencies and builds dist/

npm run dev -- check ./src     # runs the CLI straight from the source
npm run check                  # type checking + tests
npm run build                  # compiles src/ into dist/
npm link                       # creates the global tokentidy command (points to dist/)
```

More commands and the step-by-step for testing the install as a user are in [docs/commands.md](docs/commands.md).

---

## 🔗 About the TCC

- **Topic:** a tool for detecting, fixing and generating design tokens in front-end projects
- **Author:** Laís Coutinho
- **Program / Institution:** _to fill in_
- **Advisor:** _to fill in_
- **Experiment lab:** [tcc-labs](https://github.com/laiscoutinho/tcc-labs)

---

## 📄 License

_Choose a license (e.g. MIT) or state that the content is for academic use._

---

<sub>Made with curiosity and lots of coffee ☕</sub>
