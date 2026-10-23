# 🧹 TokenTidy

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](docs/pt-br/README.md).

A command-line tool built as my **undergraduate capstone project (TCC)** to help keep front-end code **faithful to the design system**. It finds hardcoded visual values in the code (such as `#4f46e5`, `17px` or `font-family: Arial`), points out which **design token** should be used instead, fixes the code safely and, when the project has no tokens yet, helps create them.

> ⚠️ Work in progress (version `0.0.x`: each feature is a patch release; `0.1.0` will be the first with every planned feature). Today TokenTidy finds hardcoded values in CSS, SCSS, Sass, Less, HTML, React (JSX/TSX) and Angular, generates design tokens from the repeated ones and replaces hardcoded values with tokens of exactly the same value. See the [roadmap](#️-roadmap).

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
| 11 | [Configuration](docs/configuration.md) | The `tokentidy.config.json` file |
| 12 | [Exit codes](docs/exit-codes.md) | What the number at the end of each command means |
| 13 | [Scripts and CI](docs/ci-and-scripts.md) | npm scripts, GitHub Actions and pre-commit checks |
| 14 | [JSON output](docs/json-output.md) | Reading the results from another program |
| 15 | [How it works](docs/how-it-works.md) | The steps inside TokenTidy and its principles |

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
| 🔁 **Fix** | Replaces values with tokens by editing only the necessary slice, with a preview (`--dry-run`) and, by default, only for exact matches |
| 🏷️ **Generate** | When the project has no tokens, groups repeated values and proposes a token file with familiar names |
| 🛡️ **Verify** | Predictable output, `--json` and dedicated exit codes to run in CI and pre-commit hooks |

What sets it apart is **context**: TokenTidy looks at what a value is doing (the property, the selector, the declarations next to it) before deciding whether it should be a token. More in [How it works](docs/how-it-works.md).

---

## 🧭 Scope

| Analyzes | Out of scope (by design) |
|---|---|
| CSS, SCSS, Sass (indented) and Less | Tailwind and other utility-class approaches |
| React inline styles (`style={{...}}` in JSX/TSX) | CSS-in-JS libraries |
| Angular: component styles, style files and templates (`[style.x]`, `[ngStyle]`) | Dynamic styles computed only at runtime |
| HTML (`<style>` and `style=""`) | Artificial intelligence and external services |
| Design token files in the [DTCG](https://www.designtokens.org/) format | |

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
| Context-aware detection (page container vs. icon size) | 🟡 |
| CI usage and npm release | 🟡 CI on Linux/Windows/macOS |
| Fixes of values close to a token (`fix --approximate`) | ⚪ |
| Suggesting the exact or closest token (`check --tokens`) | ⚪ |
| Near-duplicate colors and renaming existing tokens | ⚪ |
| Style objects outside `style={{}}` and CSS-in-JS | ⚪ |
| Mapping `var()` fallback values (e.g. `var(--space, 12px)`) | ⚪ |
| Relative units (`%`, `vw`, `vh`): compare with absolute values used in the same role | ⚪ |
| Comparative evaluation on the base projects | ⚪ |
| Writing the TCC text | ⚪ |

The detailed plan, version by version, is in [development/roadmap.md](development/roadmap.md).

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
│   ├── fix/              # automatic fixes: token candidates, plan, diff, safe apply
│   └── safe-write.ts     # atomic writes inside the project
├── test/                 # automated tests and sample projects (fixtures)
├── docs/                 # user documentation (English, with pt-br/ translations)
└── development/          # development docs: setup, code standard, roadmap, logs
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

| Document | Content |
|---|---|
| [Local setup](development/local-setup.md) | Development commands, testing the install as a user, CI and releases |
| [Code standard](development/code-standard.md) | Comments, file size, names and folders |
| [Roadmap](development/roadmap.md) | The plan from 0.0.10 to 0.1.0 |
| [Development guide](development/development-guide.md) | The original phases and golden rules |
| [Research log](development/research-log.md) and [experience log](development/experience-log.md) | Sources behind each decision, and the difficulties found |

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
