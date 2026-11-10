# 🧹 TokenTidy

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](docs/pt-br/README.md).

A command-line tool built as my **undergraduate capstone project (TCC)** to help keep front-end code **faithful to the design system**. It finds hardcoded visual values in the code (such as `#4f46e5`, `17px` or `font-family: Arial`), points out which **design token** should be used instead, fixes the code safely and, when the project has no tokens yet, helps create them.

> ⚠️ Work in progress (version `0.0.x`: each feature is a patch release; `0.1.0` will be the first with every planned feature). Today TokenTidy finds hardcoded values in CSS, SCSS, Sass, Less, HTML, React (JSX/TSX) and Angular, generates design tokens from the repeated ones (with light/dark themes and a JS module for canvas and charts), replaces hardcoded values with tokens (close values only with your authorization and the coherence guards), compares micro-frontends and validates DTCG token files. See the [roadmap](#️-roadmap).

```bash
npm install -D github:laiscoutinho/tokentidy
npx tokentidy check
```

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
```

---

## 📖 Recommended reading

New to the command line or to design tokens? Read in this order; each page covers one subject.

| # | Page | What you'll learn |
|---|---|---|
| 1 | [Design tokens](docs/design-tokens.md) | What tokens are and why hardcoded values are a problem |
| 2 | [Terminal basics](docs/terminal-basics.md) | How to open a terminal and run a command |
| 3 | [Installation](docs/installation.md) | How to install TokenTidy in your project |
| 4 | [Quick start](docs/quick-start.md) | From the first analysis to the first fix, step by step |
| 5 | [Commands](docs/commands.md) | Every command and the options they share |
| 6 | [check](docs/check.md) | Finding hardcoded values |
| 7 | [Rules](docs/rules.md) | What each rule reports, and what is never reported |
| 8 | [Ignore comments](docs/ignore-comments.md) | Keeping an intentional value |
| 9 | [generate](docs/generate.md) | Creating tokens from the repeated values |
| 10 | [fix](docs/fix.md) | Replacing values with tokens |
| 11 | [validate](docs/validate.md) | Checking DTCG token files |
| 12 | [Themes](docs/themes.md) | Light and dark tokens from the theme the code already has |
| 13 | [Micro-frontends](docs/micro-frontends.md) | Several apps at once: collisions, drift and a shared token package |
| 14 | [Configuration](docs/configuration.md) | The `tokentidy.config.json` file |
| 15 | [Exit codes](docs/exit-codes.md) | What the number at the end of each command means |
| 16 | [Scripts and CI](docs/ci-and-scripts.md) | npm scripts, GitHub Actions and pre-commit checks |
| 17 | [JSON output](docs/json-output.md) | Reading the results from another program |
| 18 | [How it works](docs/how-it-works.md) | The steps inside TokenTidy and its principles |
| 19 | [Examples](docs/examples.md) | Real runs of each command, from the first analysis to scripts |

---

## ❓ The problem

In almost every front-end project, the design starts organized and slowly drifts:

- The same color shows up written five different ways (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…)
- "Almost equal" spacing values appear, like `10px`, `11px` and `12px`, that should be a single one
- Styles end up scattered across CSS, SCSS, inline styles and components
- When the design changes (e.g. the primary color), the value has to be hunted down and replaced by hand in many files

The result is an **inconsistent** interface and code that is **hard to maintain**. Traditional linters (ESLint, Stylelint) check whether the code is well written, but **they don't know whether it follows the design system**. And many projects **never had tokens at all**: building a set from scratch out of existing code is slow and manual.

---

## 💡 The proposal

**TokenTidy** tackles two problems: **detecting and fixing drift** where a standard already exists, and **helping create the standard** where it doesn't exist yet.

| Step | What it does |
|---|---|
| 🔍 **Detect** | Scans the project and finds hardcoded visual values (colors, spacing, sizes, radius, typography, shadows, motion…), with file, line and column |
| 🎯 **Suggest** | Compares each value with the project's tokens and points to the exact or closest token, explaining the choice |
| 🔁 **Fix** | Replaces values with tokens by editing only the necessary slice, with a preview (`--dry-run`); close values only when you authorize them and the coherence guards allow it |
| 🏷️ **Generate** | When the project has no tokens, groups repeated values and proposes a token file with familiar names |
| 🛡️ **Verify** | Predictable output, `--json` and dedicated exit codes to run in CI and pre-commit hooks; `validate` checks the token files |

What sets it apart is **context**: TokenTidy looks at what a value is doing (the property, the selector, the declarations next to it) before deciding whether it should be a token. More in [How it works](docs/how-it-works.md).

---

## 🧭 Scope

| Analyzes | Out of scope (by design) |
|---|---|
| CSS, SCSS, Sass (indented) and Less | Tailwind and other utility-class approaches |
| JS/TS: `style={{...}}`, style objects, DOM styles, SVG colors, canvas and charts | Dynamic styles computed only at runtime |
| CSS-in-JS: styled-components, Emotion, `css` prop, MUI `sx` | React Native |
| Angular: component styles, style files, templates, `host`, `@HostBinding`, `Renderer2.setStyle` | |
| HTML (`<style>` and `style=""`) | Artificial intelligence and external services |
| Design token files in the [DTCG](https://www.designtokens.org/) format, the Resolver Module for themes, and tokens from installed design-system packages and JS themes | |

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
| Files and folders as input, project root detection | 🟢 |
| Rule ids, *review* items, local custom properties, breakpoints | 🟢 |
| Ignore comments and ignored folders | 🟢 |
| Scale diagnosis in `generate`, safe writing | 🟢 |
| Automatic fixes of exact values (`fix`, `--dry-run`) | 🟢 |
| Context-aware detection (page container vs. icon size, controls, touch targets) | 🟢 |
| Exact and closest token in `check`, near-duplicate colors | 🟢 |
| Warnings about tokens: unknown names, `$deprecated`, `var()` fallbacks that disagree, unused tokens | 🟢 |
| Baseline for projects that already have violations | 🟢 |
| CI usage and npm release | 🟡 CI on Linux/Windows/macOS |
| SCSS mixin arguments and defaults, `mat.*-overrides` maps | 🟢 |
| Style objects outside `style={{}}`, DOM styles, canvas and charts | 🟢 |
| CSS-in-JS (styled-components, Emotion, `sx`) | 🟢 |
| Angular `host`, `@HostBinding`, `Renderer2.setStyle` | 🟢 |
| Reports: `check --summary`, `--format github`, `schemaVersion` | 🟢 |
| Tokens from npm packages and JS themes; semantic alias suggested over a primitive | 🟢 |
| Coherence guards (states, contrast, spacing order, nested radius, type scale, variants) | 🟢 |
| Consolidation of close values in `generate`; `fix --approximate` with prompt, `--yes`, `--no-input` and saved decisions | 🟢 |
| `tokens.ts` module and `fix` for canvas and chart libraries | 🟢 |
| Micro-frontends: `:root` collisions, drift, design-system versions, `generate --shared` | 🟢 |
| `validate` against the DTCG 2025.10 schema and reference rules | 🟢 |
| Light/dark themes with the DTCG Resolver Module | 🟢 |
| Relative units (`%`, `vw`, `vh`): compare with absolute values used in the same role | ⚪ |
| Comparative evaluation on the base projects | ⚪ |
| Writing the TCC text | ⚪ |

---

## 📁 Repository structure

```
tokentidy/
├── src/
│   ├── cli.ts            # entry point (enables the compile cache and loads cli/program.ts)
│   ├── cli/              # the command-line program: one module per command, output, exit codes
│   ├── index.ts          # public API, to use TokenTidy as a library
│   ├── types.ts          # shared types (e.g. Finding, a hardcoded value found)
│   ├── project/          # config, project root and the files to analyze
│   ├── analysis/         # reads each file, applies the rules and ignore comments
│   ├── parsers/          # CSS/SCSS/Sass/Less (css/), HTML, JSX/TSX, Angular and DTCG
│   ├── values/           # value normalization and color information
│   ├── token-index.ts    # tokens the project already defines, and where each syntax works
│   ├── generate/         # token generation: grouping, names (naming/), output files (output/)
│   ├── check/            # token suggestions, baseline, summary, GitHub annotations, micro-frontends
│   ├── coherence/        # element model and coherence guards (states, contrast, spacing, radius, type)
│   ├── consolidate/      # close values merged by role, and the saved decisions
│   ├── fix/              # automatic fixes: token candidates, plan, diff, safe apply
│   ├── validate/         # DTCG schema and reference checks
│   └── safe-write.ts     # atomic writes inside the project
├── schemas/              # DTCG 2025.10 JSON schemas used by validate
├── test/                 # automated tests and sample projects (fixtures)
└── docs/                 # user documentation (English, with pt-br/ translations)
```

The CLI (`cli.ts` and `cli/`) only handles input and output; all analysis lives in separate modules that can be tested without a terminal.

---

## 🛠️ Development

Written in **TypeScript** (ESM), with Node.js **22.20 or later**, which runs the `.ts` files directly.

```bash
git clone https://github.com/laiscoutinho/tokentidy.git
cd tokentidy
npm install        # installs dependencies and builds dist/
npm run check      # type checking + tests
```

---

## 🤝 Community

TokenTidy is my **undergraduate capstone project (TCC)**, so for now it **doesn't accept external contributions** (pull requests). Issues reporting bugs or ideas are welcome.

After the TCC presentation, the project will open to contributions as open source. Any use, copy or derived work must always **cite this repository** ([github.com/laiscoutinho/tokentidy](https://github.com/laiscoutinho/tokentidy)) **and its author, Laís Coutinho**.

- **Topic:** a tool for detecting, fixing and generating design tokens in front-end projects
- **Author:** Laís Coutinho
- **Program / Institution:** _to fill in_
- **Advisor:** _to fill in_
- **Experiment lab:** [tcc-labs](https://github.com/laiscoutinho/tcc-labs)

---

## 📄 License

[Apache License 2.0](LICENSE). You may use, modify and distribute TokenTidy, including commercially, as long as you keep the license and the [NOTICE](NOTICE) file, which credits Laís Coutinho and links to this repository.

---

<sub>Made with curiosity and lots of coffee ☕</sub>
