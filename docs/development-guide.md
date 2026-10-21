# Development guide: a CLI to detect and fix design token violations

Tool scope: a TypeScript/Node CLI for **CSS/SCSS, React (JSX/TSX) and Angular** (no Tailwind) that detects hardcoded values (colors, spacing, typography), suggests the closest token, applies autofix and, when there is no token file, generates one.

---

## How to use this guide

1. Follow the phases **in order**. Each phase depends on the previous one.
2. Each phase has: goal, what to do, what to study, what you'll need, good practices, what **not** to do, links, an exercise and the **"Done when"** criteria.
3. Only move on when every "Done when" item is checked **and** you can redo the exercise without copying anything.
4. Keep an experiments repository (one folder per phase) and a short log per phase (template at the end). It becomes material for LinkedIn and for the TCC.
5. Links marked with ✅ were checked during the research for this guide; the others are well-known official pages, worth opening once.

> **This guide is the baseline, not the rule.** When a better option shows up, it replaces the guide's, and the decision (with the reason) is recorded in [CLAUDE.md](CLAUDE.md). Already replaced: `tsx` (Node runs `.ts` directly), `fast-glob` (replaced by Node's `fs.glob`, for security), `vitest` (replaced by `node:test`), `chalk` (replaced by Node's `util.styleText`) and `postcss-value-parser` (replaced by `@csstools/css-tokenizer` and `css-parser-algorithms`, which follow the spec and deliver typed tokens). The current state of each phase is in [Status after v0.0.4](#status-after-v004).

### Phase map

| Phase | Topic | Deliverable | Suggested pace (estimate) |
|---|---|---|---|
| 0 | TypeScript, Node and the CLI skeleton | `my-cli check ./src` counts files per extension | 1 to 2 weeks |
| 1 | AST and parsing concepts | Mind map + astexplorer exercise | 1 week |
| 2 | CSS/SCSS parsing (PostCSS) | Script that lists literal values with file/line/column | 1 to 2 weeks |
| 3 | JSX/TSX parsing | Same report for `style={{...}}` | 1 to 2 weeks |
| 4 | Angular | `@Component` styles and templates analyzed | 2 weeks |
| 5 | Design tokens as data | Token file reader with a value → token index | 1 week |
| 6 | Normalization and closest value | Token suggestion with a justification | 1 to 2 weeks |
| 7 | Autofix | Idempotent `--fix` and `--dry-run` | 1 to 2 weeks |
| 8 | Testing and quality | Fixtures, snapshots, CLI tests, CI | ongoing, formalize in 1 week |
| 9 | Token generation (Nickerson) | Token file generated from a project | 2 to 3 weeks |
| 10 | Polish, documentation and release | README, `--json`, published version | 1 to 2 weeks |

> The pace is an estimate for someone studying alongside their degree. Adjust it to your routine.

### Status after v0.0.4

The phases were not followed strictly in order: after Phase 2, the priority became proving the two critical features (generation and autofix) on the lab's projects, and the phases they depend on were done as needed. Decisions and reasons are in [CLAUDE.md](CLAUDE.md).

| Phase | Status | What it became |
|---|---|---|
| 0 | ✅ Done (v0.0.1) | TypeScript + ESM, Node type stripping instead of `tsx`, `fs.glob` instead of `fast-glob` |
| 1 | ✅ Study | No code |
| 2 | ✅ Done (v0.0.2), extended in v0.0.3 | CSS, SCSS, plus **Less** (`postcss-less`), **indented Sass** (`sass-parser`) and `<style>` in HTML. Values analyzed with `@csstools` |
| 3 | ✅ Done (v0.0.3) | `style={{}}` in JSX/TSX with `@babel/parser` 8, numbers with an implied `px`, inline `style=""` in HTML with `parse5`. Missing: style objects outside the attribute, CSS-in-JS |
| 4 | ✅ Done (v0.0.3) | `@Component` `styles`, `template` and `templateUrl` with `@angular/compiler` 22: `style=""`, `[style.x.unit]`, `[ngStyle]`, `@if`/`@for` blocks |
| 5 | 🟡 Partial | DTCG files and existing tokens (`--x`, `$x`, `@x`) are read as definitions and used by `generate`. Missing: `check --tokens` and the value → token index for suggestions |
| 6 | 🟡 Partial | Normalization done (`src/suggest/normalize.ts`: colors to hex/OKLCH, `pt` → `px`, `s` → `ms`, keyword weights). Decided **not** to merge `px` and `rem` (it becomes a suggestion). Missing: "closest value" with tolerances (ΔE for colors) |
| 7 | ⏭️ **Next** | The data is ready: every token stores its occurrences (offsets, host, enclosing function, implied unit) in the DTCG extension |
| 8 | 🟡 Ongoing | 126 tests with `node:test`: per module, all hosts in one fixture, the `slice(offset, endOffset) === value` invariant, the CLI end to end. CI not set up yet |
| 9 | ✅ Done (v0.0.4) | DTCG 2025.10 output + CSS/SCSS/Less, threshold `minOccurrences`, reuse of existing tokens, scale names, semantic aliases, `--extend`/`--new`, suggestions |
| 10 | 🟡 Partial | `--json`, exit codes and `tokentidy.config.json` done. Missing: ignore comment, ignored folders, `--quiet`, publishing |

---

## Golden rules (apply to every phase)

**Always**
- Separate the **CLI** (arguments, output) from the **core** (analysis). The core must be testable without a terminal.
- Treat every file as "may be broken": if the parser fails, report a `parse-error` and **keep going** with the other files.
- Store for each finding: file, line, column, original slice, kind (color, spacing...) and absolute position (offset). The offset is what makes autofix possible.
- Write a test for every bug you fix.
- Stop and read the source of a reference tool when you get stuck (see "References").

**Never**
- Never analyze CSS/JSX/templates with **regex**. Regex is for validating an isolated value (e.g. "is this a hex?"), not for understanding the file's structure.
- Never rewrite the whole file from the AST if you only need to replace one value (you lose formatting and comments). Edit by position.
- Never change the user's files without an explicit `--fix`, and offer `--dry-run`.
- Never silently "guess and fix" approximate values. Suggest; only autofix what is **exact** (unless the user enables an option).
- Never send usage data/telemetry without consent (clig.dev guideline).
- Never rely on `any` in TypeScript to "make it pass".

---

## Phase 0: TypeScript, Node and the CLI skeleton

**Goal:** have a locally installable CLI that scans a directory and counts how many files of each extension exist (`.css`, `.scss`, `.jsx`, `.tsx`, `.ts`, `.html`).

### What I should do
1. Install a **current LTS Node (22 or later)** and create the project (`npm init`, `git init`, `.gitignore` with `node_modules` and `dist`).
2. Configure TypeScript in `strict` mode with modern module resolution (`NodeNext`).
3. ~~Run TypeScript directly in development with `tsx`~~ → Node 22.18+ runs `.ts` by itself (no build on every change). For the final build, use `tsc` (simpler to learn) or `tsdown` (current bundler for TS libraries/CLIs).
4. Create `src/cli.ts` with the `#!/usr/bin/env node` shebang and point the `bin` field in `package.json` to the **compiled** file.
5. Use **commander** (or `cac`) to create the `check <dir>` command with `--help` and `--version`.
6. Scan files with ~~**fast-glob**~~ Node's built-in `fs.glob`, ignoring `node_modules`, `dist`, `.git` and build folders.
7. Count per extension and print the result to `stdout`; errors and warnings to `stderr`; exit code `0` (ok) or non-zero (failure).
8. Run `npm link` and run the CLI from **another folder** on the computer.

### What I will study
- **JavaScript:** modules (ESM vs CommonJS), `async/await`, `Promise`, arrays/objects (`map`, `filter`, `reduce`), basic regex.
- **TypeScript:** types, interfaces, generics, union types, type guards, `tsconfig.json`.
- **Node:** `fs`, `path`, `process` (`argv`, `exitCode`, `stdout`, `stderr`).
- **How a CLI "becomes a command":** the `bin` field in `package.json`, the shebang, `npm link`.
- **CLI design:** the clig.dev guide (mainly: basics, help, output, errors, arguments and flags).

### What I'll need
Node LTS (22+), npm, git, an editor with TypeScript; packages `typescript`, `tsx`, `commander`, `fast-glob`, `vitest`. (The current commander version requires Node 22.12 or later.)

### Good practices
- `--help` with **examples** at the top and `--version` read from `package.json`.
- Main output to `stdout`, messages/errors to `stderr`; exit code `0` on success and non-zero on failure (that's what CI uses).
- Prefer **flags** to positional arguments when there's more than one piece of data; full flag names (`--fix`, `--dry-run`, `--json`).
- Use Node's `path`, never build paths by concatenating `/` (Windows exists).
- Declare `engines` and `files` in `package.json` (publish only `dist`).
- Respect `NO_COLOR` if you use colors; don't animate spinners when output isn't a terminal.

### What NOT to do
- Don't put analysis logic inside `cli.ts`.
- Don't scatter `process.exit()` across the code; centralize it at the entry point.
- Don't walk folders with recursive `fs` "by hand" without ignoring `node_modules`.
- Don't mix CommonJS and ESM without understanding the difference.
- Don't use `console.log` for errors.

### Links
- ✅ clig.dev (Command Line Interface Guidelines): https://clig.dev
- ✅ commander.js: https://github.com/tj/commander.js
- fast-glob: https://github.com/mrmlnc/fast-glob
- MDN, JavaScript Guide: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Node.js, ESM: https://nodejs.org/api/esm.html
- Node.js, `process`: https://nodejs.org/api/process.html
- npm, the `bin` field in package.json: https://docs.npmjs.com/cli/configuring-npm/package-json#bin
- npm link: https://docs.npmjs.com/cli/commands/npm-link
- ✅ tsdown (bundler): https://tsdown.dev
- 12 Factor CLI Apps (cited by clig.dev): https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46

### Exercise
A CLI that takes a directory and prints how many files of each extension exist, with `--help`, `--version` and a friendly error for a missing directory.

### Done when
- [x] I install my CLI with `npm link` and run it from any folder.
- [ ] I can explain the difference between ESM and CommonJS and why I chose one of them.
- [ ] I can explain what the shebang and the `bin` field do.
- [ ] I can type a function with a union type and with a generic, and use a type guard.
- [ ] I can explain `stdout` vs `stderr` and what the exit code is for.
- [x] The scanning logic is **outside** `cli.ts` and has at least one test.

---

## Phase 1: AST and parsing (the theory behind the project)

**Goal:** understand what a syntax tree is and why the project needs one. No production code in this phase.

### What I should do
1. In **astexplorer.net**, paste CSS, SCSS, JSX and TSX and look at the generated nodes. Switch parsers (postcss, babel, typescript-estree) and compare.
2. Find **by hand** which node holds the color `#ff0000` in `color: #ff0000` (CSS) and in `style={{ color: '#ff0000' }}` (JSX).
3. Read the first chapters of *Crafting Interpreters* (source code → tokens → tree).
4. Write a summary in a file (in your own words): *code → tokens → AST → walk with a visitor → point to the position → edit*.

### What I will study
- Source code → tokens → AST; what walking the tree means (**visitor pattern**).
- **AST vs CST** and why positions (`loc`, `start`, `end`, `offset`) matter for autofix.
- Why each language/parser produces different trees (CSS, JS/JSX, Angular templates).

### What I'll need
A browser (astexplorer) and a notebook/notes file.

### Good practices
- Always think **"where exactly is the value in the file?"**: that's the question autofix will demand.
- Note differences between parsers: for example, line/column start at different bases in different tools (check each parser's documentation before reporting positions).

### What NOT to do
- Don't skip this phase "because it can be done with regex". Cases like comments, strings, `calc()`, shorthands and values inside functions break regex quickly.
- Don't memorize node names; understand the structure.

### Links
- astexplorer: https://astexplorer.net
- Crafting Interpreters (free): https://craftinginterpreters.com
- Babel Plugin Handbook (section on AST and visitors): https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md
- ✅ PostCSS Architecture: https://postcss.org/docs/postcss-architecture

### Exercise
For 5 snippets (2 CSS, 1 SCSS, 2 JSX), write down the type of the node holding the literal value and the path from the root to it.

### Done when
- [ ] I can explain in my own words why this **can't** be done with regex alone (with 2 examples that break).
- [ ] I can explain what a visitor is and what "walking" the tree means.
- [ ] I can say why the node's position is essential for autofix.
- [ ] I correctly found the color node in both examples (CSS and JSX).

---

## Phase 2: CSS and SCSS parsing (PostCSS)

**Goal:** list every literal color, spacing and typography value in `.css`/`.scss` files, with file, line and column.

### What I should do
1. Install `postcss`, `postcss-scss` and ~~`postcss-value-parser`~~ `@csstools/css-tokenizer` + `@csstools/css-parser-algorithms` (+ `@csstools/css-color-parser` to recognize colors).
2. Read a file, parse it (with `postcss-scss` for `.scss`) and walk the declarations (`walkDecls`).
3. For each declaration, split the **value** into parts with ~~`postcss-value-parser`~~ the tokenizer (words, functions, strings, separators).
4. Classify the property: color (`color`, `background-color`, `border-color`...), spacing (`margin`, `padding`, `gap`...), typography (`font-size`, `line-height`, `font-family`...).
5. Report **literal** values; ignore those already using `var(--x)` (and, in SCSS, `$x` variables, if you decide to treat them as "already tokenized").
6. Handle *shorthands* (`margin: 4px 8px`) and composite values (`border: 1px solid #ccc`), reporting **each part** with its position.
7. Store the **offset** of each finding (needed in Phase 7).

### What I will study
- PostCSS structure: `Root`, `Rule`, `Declaration`, `AtRule`, `Comment`; `walkDecls`, `walkRules`, `walkAtRules`.
- `postcss-scss`: `$x` variables, `@include`, `@mixin`, `#{}` interpolation, `//` comments.
- CSS custom properties (`--x`, `var(--x, fallback)`), `calc()`, units (`px`, `rem`, `em`, `%`).
- ~~`postcss-value-parser` (node types: word, function, string, space, div)~~ → the CSS Syntax Level 3 token types (`ident`, `dimension`, `hash`, `number`, `function`).
- Where PostCSS reports positions (`source.start`/`source.end`).

### What I'll need
`postcss`, `postcss-scss`, ~~`postcss-value-parser`~~ the `@csstools` packages; a `fixtures/css` folder with 10 to 15 sample files (literal values, `var()`, shorthands, comments, SCSS with variables).

### Good practices
- Define a **list of relevant properties** per category (a config file/constant) instead of scattered `if`s.
- Handle **values inside functions** (`rgba(0,0,0,.5)`, `linear-gradient(...)`): decide and document whether they're analyzed.
- Values like `0`, `auto`, `inherit`, `transparent`, `currentColor` are usually **not** violations; keep a list of exceptions.
- Decide right away what to do with `!important` and with disable comments (e.g. `/* ignore-token */`).
- Write fixture tests **from this phase on** (see Phase 8).

### What NOT to do
- Don't use regex to split `margin: 4px 8px 0 auto`.
- Don't assume every `.scss` is valid CSS; use the SCSS parser.
- Don't silently ignore files that failed to parse.
- Don't mix the logic of "what is a violation" with "how to walk the file".

### Links
- ✅ PostCSS docs: https://postcss.org/docs/
- ✅ PostCSS API: https://postcss.org/api/
- ✅ Writing a PostCSS Plugin (to understand the walk/visit cycle): https://postcss.org/docs/writing-a-postcss-plugin
- postcss-scss: https://github.com/postcss/postcss-scss
- postcss-value-parser: https://github.com/TrySound/postcss-value-parser
- @csstools/css-tokenizer and friends: https://github.com/csstools/postcss-plugins/tree/main/packages
- ✅ Reference for expected behavior (design-lint, rules and docs): https://github.com/bylapidist/design-lint

### Exercise
A script that lists every declaration with a literal color, spacing or font size, with file, line and column.

### Done when
- [x] The script handles shorthands and reports each part with the correct position.
- [x] The script ignores values that already use `var(--...)` and values in the exception list.
- [x] It works on `.css` and `.scss` (including `$x` variables and `//` comments).
- [x] A file with a syntax error produces a `parse-error` and does **not** stop the run.
- [x] I have fixtures and tests covering at least 10 cases (including the "not a violation" ones).

---

## Phase 3: JSX/TSX parsing (React)

**Goal:** find literal values in inline styles (`style={{ ... }}`) of React components, with exact positions.

### What I should do
1. Pick the parser: **`@babel/parser`** (+ `@babel/traverse`) or **`@typescript-eslint/typescript-estree`**. Pick one, justify it in your log and use it across the whole project.
2. Parse `.jsx` with the `jsx` plugin and `.tsx` with `jsx` + `typescript` (in Babel). For `.ts` without JSX, only `typescript`.
3. Walk the tree to a `JSXAttribute` named `style` and read the `ObjectExpression`.
4. For each property, read the **key** (camelCase, e.g. `backgroundColor`) and the **value**: string literal, number, template literal without expressions.
5. Reuse the classification from Phase 2 (mapping camelCase → CSS property).
6. Report the exact position of the **value** (not the whole attribute).
7. `*.module.css` and `.css` files imported by components are still covered by Phase 2.

### What I will study
- Relevant nodes: `JSXAttribute`, `JSXExpressionContainer`, `ObjectExpression`, `ObjectProperty`, `StringLiteral`, `NumericLiteral`, `TemplateLiteral`.
- In React, **numbers** in inline styles (e.g. `padding: 8`) become `px` for most properties, but unitless properties (`lineHeight`, `opacity`, `zIndex`, `flex`) **don't**. That changes what a "violation" is and what autofix writes.
- How to get `loc`/`range` in each parser (in typescript-estree, these options are **off** by default and must be turned on).
- The difference between syntax-only analysis and analysis with type information (you only need syntax).

### What I'll need
`@babel/parser` and `@babel/traverse` (and `@babel/types`), **or** `@typescript-eslint/typescript-estree`; a `fixtures/react` folder with varied components (literal values, variables, dynamic props, conditionals).

### Good practices
- Explicit scope: **literal values only**. Dynamic expressions (`style={{ color: props.color }}`) stay out, and that must be documented.
- Decide and document what happens with `styled-components`/CSS-in-JS (suggestion: out of the initial scope) and Tailwind (out of scope).
- Reuse the **same core** for classification/normalization from Phase 2; only the way values are extracted changes.
- Test with `.jsx`, `.tsx`, TS generics and files with nested JSX.

### What NOT to do
- Don't use the same set of plugins for everything (a `<T>` in `.ts` conflicts with JSX).
- Don't treat `padding: 8` as the string `"8"`; understand React's semantics.
- Don't report the position of the `style` attribute instead of the value's.
- Don't duplicate the classification logic per parser.

### Links
- ✅ @babel/parser: https://babeljs.io/docs/babel-parser
- @babel/traverse: https://babeljs.io/docs/babel-traverse
- ✅ @typescript-eslint/typescript-estree: https://typescript-eslint.io/packages/typescript-estree/
- ✅ A simple reference ESLint plugin ("don't use hex" rule): https://github.com/MetaMask/design-tokens
- React, inline styles: https://react.dev/reference/react-dom/components/common#applying-css-styles

### Exercise
Find literal values inside `style={{ ... }}` in a component and print the same report as Phase 2, with the exact position of the value.

### Done when
- [ ] I find violations in TSX/JSX with exact line/column (checked by opening the file at that position).
- [ ] I handle numbers vs strings and unitless properties correctly.
- [ ] I ignore (and document) dynamic styles and exception values.
- [ ] I reuse the same classification core from Phase 2.
- [ ] I have fixtures and tests covering `.jsx` and `.tsx`.

---

## Phase 4: Angular

**Goal:** analyze Angular component styles and templates and pass the extracted CSS to the same logic as Phase 2.

### What I should do
1. Parse `.ts` files and find classes with the `@Component` decorator.
2. Read the decorator's properties: `styles`, `styleUrl`/`styleUrls`, `template`, `templateUrl`.
3. **Styles:** for inline `styles`, extract the text and run Phase 2 (adding the offset to keep the position right in the `.ts`); for `styleUrls`, resolve the paths and analyze the `.css`/`.scss` files.
4. **Templates:** for inline `template` and `.html` files, parse the template and find `style="..."` attributes, `[style.color]` bindings and `[ngStyle]`.
5. For the MVP, start with: styles (`styles`/`styleUrls`) and static `style="..."` attributes. Dynamic bindings come later.

### What I will study
- Anatomy of `@Component` (standalone vs modules doesn't matter for the analysis, but the decorator does).
- Angular template syntax: property/style binding, `ngStyle`, interpolation.
- How to parse templates: **`parseTemplate`** from `@angular/compiler` (also used by angular-eslint) or **`@angular-eslint/template-parser`**.
- Angular style encapsulation (`:host`, `::ng-deep`) to avoid false positives.

### What I'll need
`@angular/compiler` and/or `@angular-eslint/template-parser`; the TS parser chosen in Phase 3 to read the decorator; a small Angular project in `fixtures/angular`.

### Good practices
- Watch out for **API stability**: the Angular compiler isn't meant as a stable public API. **Pin the version**, isolate its use in a single module and cover it with tests.
- Compute the **offset** of inline template/styles relative to the `.ts` file to report correct positions.
- Leave Angular for last in the tests: that's where formats vary the most.
- Studying how angular-eslint organizes its template parser helps avoid reinventing the wheel.

### What NOT to do
- Don't try to analyze Angular templates with a generic HTML parser and regex.
- Don't depend on compiler internals spread across the code.
- Don't forget to test with different Angular versions if you plan to support more than one.

### Links
- ✅ angular-eslint (repository): https://github.com/angular-eslint/angular-eslint
- ✅ @angular-eslint/template-parser (npm): https://www.npmjs.com/package/@angular-eslint/template-parser
- Components and styling docs: https://angular.dev/guide/components/styling
- Templates docs: https://angular.dev/guide/templates

### Exercise
Extract the CSS from a `@Component` (inline and via `styleUrls`) and pass it to the Phase 2 logic, reporting correct positions in the original file.

### Done when
- [ ] I extract inline and external styles from a real component.
- [ ] I report the correct position even when the style is inside the `.ts`.
- [ ] I find static `style="..."` in `.html` templates.
- [ ] The Angular compiler dependency is isolated in a single module.
- [ ] I have fixtures for at least 3 Angular components and tests for them.

---

## Phase 5: Design tokens as data

**Goal:** read a token file, validate it and build a value → token index to compare against the code.

### What I should do
1. Define your **internal model** of a token: path/name, type, value (already normalized) and optional description.
2. Pick the input format. Suggestion to keep the tool simple: a **subset of the W3C DTCG format** (JSON with `$value`, `$type`, groups and aliases).
3. Read and **validate** the JSON (clear error messages pointing to the path of the invalid token).
4. **Resolve aliases** (a token that references another) and detect cycles.
5. Build the **normalized value → list of tokens** index (more than one token may share a value).
6. Define the **mapping table** CSS property → token type (e.g. `color`/`background-color` → color; `margin`/`padding`/`gap` → spacing; `font-size` → font size).
7. Also support tokens already exposed as CSS custom properties (`--color-primary`), to know when the code is already tokenized.

### What I will study
- What design tokens are and their levels (primitive, semantic, component).
- The DTCG format: `$value`, `$type`, `$description`, groups, aliases. Version **2025.10** is the first stable one; check how the spec describes the color type.
- How real projects expose tokens: JSON, CSS variables, SCSS variables.
- Style Dictionary (to understand how the ecosystem transforms tokens, without having to use it).
- How the reference tool (design-lint) models tokens and rules (it uses its own **DTIF** format, not DTCG; decide consciously which one you accept).

### What I'll need
A token file written by you (JSON) for a small project; a simple validator (hand-written or with a schema library).

### Good practices
- Validate early and say **which token** is wrong, not just "invalid JSON".
- Normalize at read time (once), not on every comparison.
- Keep the input format **documented** with an example in the README.
- Keep the list of supported types small at first (color, spacing, font size).

### What NOT to do
- Don't invent your own format without need; use the open standard as a base.
- Don't let unresolved aliases or cycles pass without an error.
- Don't assume "one value = one token": prepare the index for multiple candidates.
- Don't mix the token file logic with the CSS/JSX parser logic.

### Links
- ✅ DTCG 2025.10 spec (stable): https://www.designtokens.org/TR/2025.10/
- ✅ Design Tokens Community Group (W3C): https://www.w3.org/community/design-tokens/
- ✅ DTCG repository: https://github.com/design-tokens/community-group
- Style Dictionary: https://styledictionary.com
- ✅ design-lint: configuration, rules and architecture: https://github.com/bylapidist/design-lint (`docs/` folder)

### Exercise
Write a token file by hand for a small project and load it in TS with format validation, resolving aliases.

### Done when
- [ ] I load a valid token file and reject an invalid one with a clear message.
- [ ] I resolve aliases and detect cycles.
- [ ] I build a value → token index and handle repeated values.
- [ ] The CSS property → token type table is documented.
- [ ] I can explain the difference between a primitive and a semantic token.

---

## Phase 6: Normalization and "closest value"

**Goal:** compare code values with tokens correctly and suggest the closest token when there's no exact match.

### What I should do
1. **Normalize colors:** `#fff`, `#FFFFFF`, `rgb(255,255,255)`, `hsl(...)` and names (`white`) must become the same internal representation. Use the **culori** library (or `@csstools/css-color-parser`, already a dependency since Phase 2; compare before deciding).
2. **Normalize dimensions:** `px` and `rem` (with a configurable root, usually 16px), handling `0` and units that can't be converted (`%`, `em`).
3. **Exact match:** normalized value equal to the token's → violation with a suggested token (autofix candidate).
4. **Approximate match:** find the **closest** token with a suitable metric:
   - colors: perceptual distance (ΔE in a space like Lab/OKLab), not plain RGB distance;
   - spacing/typography: numeric difference with a configurable tolerance.
5. Assign a **confidence level** (exact, approximate within tolerance, no suggestion) and record the reason for the choice.
6. Define **tie-breaking** (two tokens at equal distance) deterministically and document it.
7. **Use the context of the value** (TokenTidy's differentiator): the property, selector, surrounding at-rules (`@media`) and sibling declarations say what role a value plays. The same `800px` as a page `max-width` and as a card `width` are different decisions; different values (or a `vw` and a `rem`) in the same role may be the same decision. Context should affect both the suggestion and its confidence.

### What I will study
- Color spaces (sRGB, HSL, Lab, OKLab) and why RGB distance doesn't match perception.
- Color difference (ΔE) and the distance functions available in culori.
- Relative and absolute CSS units, and when the `px` ↔ `rem` conversion is safe. Relative units (`%`, `vw`, `vh`) can't be converted on their own: compare them through context (where they're used and what other values play the same role).
- Choosing a **tolerance** and how to justify it (good material for the TCC).

### What I'll need
`culori` (or `@csstools/css-color-parser`); a set of "code value → expected token" pairs to test the logic (a case table, including tie cases and "no close token" cases).

### Good practices
- Isolate normalization in **pure** functions (input → output), easy to test with tables.
- Make the tolerance **configurable** (flag or config file) with a sensible, documented default.
- Record in the output **why** the token was suggested (e.g. "distance 1.8 from token X").
- Think about transparency (alpha): `rgba(0,0,0,.5)` is not the same as `#000`.
- `var(--x, fallback)` fallbacks are values too: check them against the token they fall back from.

### What NOT to do
- Don't compare colors as strings.
- Don't use Euclidean distance in RGB as if it were perceptual without knowing the limitation.
- Don't autofix **approximate** values by default.
- Don't convert units "by eye" (e.g. assuming `1rem = 16px` without making it configurable).

### Links
- ✅ culori: https://culorijs.org (see *API reference* and *Color spaces*)
- ✅ culori, API: https://culorijs.org/api/
- ✅ culori, color spaces: https://culorijs.org/color-spaces/
- Color difference (concept): https://en.wikipedia.org/wiki/Color_difference
- CSS Color Level 4: https://drafts.csswg.org/css-color/

### Exercise
Given `#0a3d91`, find the closest color token from a list and **explain why it won** (distance, metric, tie-break).

### Done when
- [ ] All equivalent color formats normalize to the same value.
- [ ] I can justify the chosen distance metric and tolerance.
- [ ] I have table tests for exact, approximate, tie and "no suggestion".
- [ ] The output explains the reason for the suggestion.
- [ ] The tolerance is configurable and documented.

---

## Phase 7: Autofix and `--dry-run` mode

**Goal:** automatically replace literal values with tokens, preserving the formatting of the rest of the file.

### What I should do
1. Define the **output strategy** per file type (e.g. CSS → `var(--color-primary)`; SCSS → variable or `var()`; JSX → string with `var(--...)`). Document the decision.
2. Apply fixes **by position**: the `magic-string` library edits the original text using the original file's indices, without reformatting. (In plain CSS, PostCSS's own mutation is also an option.)
3. Apply **all** edits for a file at once, avoiding overlap (two edits on the same slice produce an error).
4. Implement `--dry-run`: shows what **would** change (diff or list) without writing anything.
5. Implement `--fix`: writes the files and clearly reports **which files** changed and how many fixes.
6. Guarantee **idempotence**: running `--fix` twice changes nothing the second time.
7. Warn when there are uncommitted git changes before rewriting files (or require `--force`).

### What I will study
- Editing by position vs reprinting the AST (and why the former preserves formatting).
- Line endings (CRLF vs LF), BOM and file encoding.
- How tools like ESLint/Stylelint model *fixes* (a list of edits by range).
- How to produce a readable diff in the terminal.

### What I'll need
`magic-string` (ESM) and a diff library (optional); **input and expected output** fixtures for each file type.

### Good practices
- Fix only what is **exact** by default; approximate fixes only with an explicit option (e.g. `--fix-approximate`).
- Write the file safely (temporary file and rename), so a failure doesn't corrupt it.
- Report **everything that changed**: when a program changes state (here, files), clig.dev recommends telling the user.
- Keep the idempotence test as a mandatory test.

### What NOT to do
- Don't rewrite the whole file from the AST.
- Don't change anything without `--fix`.
- Don't apply edits with indices computed on the **already modified** text (use the original's indices).
- Don't ignore CRLF/LF: you could turn a whole file into a diff.

### Links
- ✅ magic-string: https://github.com/Rich-Harris/magic-string
- ✅ clig.dev, section on danger/confirmation and `--dry-run`: https://clig.dev
- ✅ design-lint, usage and `--fix` options: https://github.com/bylapidist/design-lint/blob/main/docs/usage.md
- ESLint, how fixes work: https://eslint.org/docs/latest/extend/custom-rules#applying-fixes

### Exercise
An autofix that replaces `#ff0000` with `var(--color-danger)` in a CSS file, with `--dry-run` and an idempotence test.

### Done when
- [ ] The fix preserves the formatting of the rest of the file.
- [ ] `--dry-run` writes nothing and shows exactly what would change.
- [ ] Running `--fix` twice changes nothing the second time (automated test).
- [ ] It works on CSS, SCSS and TSX with input/expected-output fixtures.
- [ ] The output reports which files changed and how many fixes were made.

---

## Phase 8: Testing and quality (formalizing what already started)

**Goal:** have a test suite that gives confidence to evolve the tool. Start writing tests in **Phase 2**; this phase organizes and completes them.

### What I should do
1. Structure `tests/` and `fixtures/` by type (css, scss, react, angular, tokens).
2. **Unit tests** for pure functions (normalization, distance, classification).
3. **Fixture tests:** input → expected output (report and fixed files).
4. **Snapshots** for reports and fixed files; review every snapshot change as if it were code.
5. **End-to-end CLI tests:** actually run the CLI and check `stdout`, `stderr` and the exit code.
6. Autofix **idempotence test** and **resilience** test (an invalid file doesn't stop the run).
7. Run tests in CI (e.g. GitHub Actions) on every push.
8. Do manual **smoke tests** on 2 or 3 real open source projects (also useful for the research). Keep them in the lab (`tcc-labs/testar-tokentidy/`), one folder per version.

### What I will study
- ~~Vitest~~ `node:test`: writing tests, assertions, snapshots, async tests.
- The difference between unit, integration and end-to-end tests.
- What a regression is and how one test per bug keeps the error from coming back.

### What I'll need
~~`vitest`~~ `node:test`; well-named fixtures; a CI workflow.

### Good practices
- One fixture case per situation ("shorthand", "var already used", "SCSS with interpolation").
- In CI, snapshots must **not** be written and divergences must fail; that's the desired behavior.
- For long outputs, prefer **file snapshots**, which are more readable.
- Cover the **negative** cases (what is *not* a violation) as rigorously as the positive ones.

### What NOT to do
- Don't update snapshots without reading the diff.
- Don't test only the "happy path".
- Don't depend on files outside the repository in tests.
- Don't couple tests to fragile text messages when a code/identifier will do.

### Links
- Node.js, test runner: https://nodejs.org/api/test.html
- ✅ Vitest, snapshots (concepts still apply): https://vitest.dev/guide/snapshot
- ✅ Vitest, writing tests: https://vitest.dev/guide/learn/writing-tests
- ✅ Vitest, testing in practice: https://vitest.dev/guide/learn/testing-in-practice

### Exercise
Set up the fixtures folder with at least 3 cases per file type and a CLI test that checks the exit code.

### Done when
- [ ] `npm test` runs everything and passes locally and in CI.
- [x] There are tests for positive **and** negative cases.
- [ ] Autofix has an idempotence test.
- [x] There is at least one end-to-end CLI test (stdout/stderr/exit code).
- [x] I ran the tool on at least 2 real projects and noted what broke.

---

## Phase 9: Token generation when there is no file (the hardest part)

**Goal:** analyze a project without a token file, group recurring values and generate a token file with **semantic names** based on a taxonomy.

### What I should do
1. **Collect** every literal value in the project (reusing Phases 2 to 4) and **normalize** them (Phase 6).
2. **Count frequency** per value and per type (color, spacing, font).
3. **Group very close values** (e.g. nearly identical colors; 15px/16px spacing) using the distance and tolerances from Phase 6; pick one representative per group.
4. **Group by role, not only by value:** use the context from Phase 6 so that the same number in different roles (a page `max-width` vs a card `width`) becomes different tokens, and different values in the same role become a candidate for a single token.
5. Build the naming **taxonomy** with the Nickerson et al. (2013) method: define the *meta-characteristic*, the *ending conditions*, and iterate with empirical-to-conceptual (looking at the values) and conceptual-to-empirical (starting from design concepts) approaches.
6. **Name** the tokens based on the taxonomy (e.g. role/function, not appearance).
7. Write the token file in the format chosen in Phase 5, with `--dry-run` by default and confirmation/a flag to write.
8. Optionally, after generating, run autofix to replace the literal values with the created tokens.

### What I will study
- The taxonomy development method by Nickerson, Varshney and Muntermann (2013) and the methodological update by Kundisch et al. (2021).
- Token naming conventions (semantic name vs name by value).
- Simple grouping algorithms (by distance threshold; no machine learning needed).
- Spacing and typography scales (4px/8px base, modular scales).

### What I'll need
All previous phases working; a set of 2 or 3 projects without tokens to validate the generation; the Nickerson et al. (2013) paper read and summarized.

### Good practices
- Generation is a **proposal**: always reviewable by a human, and it never overwrites an existing token file without confirmation.
- Record the **frequency** and **usage locations** of each generated token (helps the review).
- Make the grouping thresholds configurable and document the reasoning.
- Produce **deterministic** output (same input, same file), to make tests and diffs easy.

### What NOT to do
- Don't name tokens `color-1`, `color-2` without meaning.
- Don't overwrite an existing token file.
- Don't generate hundreds of tokens "to cover everything": prioritize recurring ones.
- Don't apply the Nickerson method superficially; it's the methodological basis and can be described in the TCC.

### Links
- ✅ Nickerson, Varshney, Muntermann (2013), DOI: https://doi.org/10.1057/ejis.2012.26
- ✅ Open access version (post-print): https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/93439
- ✅ Kundisch et al. (2021), *An Update for Taxonomy Designers*, Business & Information Systems Engineering (search by title)
- ✅ DTCG 2025.10 (output format): https://www.designtokens.org/TR/2025.10/

### Exercise
Run the generation on a project without tokens, review the generated file by hand and note 3 grouping/naming decisions with a justification.

### Done when
- [ ] The tool generates a plausible token file for a project without tokens.
- [ ] Names follow a taxonomy I can explain with the Nickerson method.
- [ ] The output is deterministic and doesn't overwrite existing files.
- [ ] The grouping thresholds are configurable and documented.
- [ ] I can describe the generation in a methodology paragraph for the TCC.

---

## Phase 10: Polish, documentation and release

**Goal:** turn the prototype into a tool someone else can install, use and trust.

### What I should do
1. **Configuration:** a versionable config file in the project (token path, extensions, tolerances, ignored paths). Precedence: flags > environment variables > project file.
2. **Outputs:** `--json` (for integration/CI), readable human output and `--quiet`.
3. **Exit codes:** define and document them (e.g. 0 no violations, 1 violations, 2 usage/execution error). ✅ Brought forward to Phase 2.
4. **README** with installation, real examples, token format, list of rules and limitations.
5. Semantic **versioning**, a `CHANGELOG` and an npm release (or use via `npx`).
6. Error messages that say **what to do** next.
7. Document what is **out of scope** (Tailwind, CSS-in-JS, dynamic styles).

### What I will study
- Semantic versioning and compatibility (CLI interfaces are contracts).
- How CLI documentation is structured (terminal help, README, examples).
- Publishing packages to npm (`files`, `exports`/`bin`, `engines`).

### What I'll need
An npm account (if publishing), a release workflow and someone outside the project to test the installation.

### Good practices
- Have someone outside follow the README from scratch and note where they got stuck.
- Interface-breaking changes must be **announced** first (deprecation) and versioned.
- Be explicit about limitations; it's more honest and useful for users and for the research.

### What NOT to do
- Don't collect telemetry without explicit consent.
- Don't rename flags or change the `--json` output without versioning.
- Don't publish without testing the installation on a clean machine.

### Links
- ✅ clig.dev (configuration, naming, distribution, future-proofing): https://clig.dev
- ✅ no-color.org: https://no-color.org
- Semantic Versioning: https://semver.org
- Keep a Changelog: https://keepachangelog.com

### Done when
- [ ] Someone outside installs and runs the tool using only the README.
- [ ] `--json` has a stable, documented format.
- [x] Exit codes are defined and documented.
- [ ] Limitations and scope are clear in the README.
- [ ] There is a published version (or installable via `npx`) with a `CHANGELOG`.

---

## References to study alongside

| What for | Reference |
|---|---|
| See how a real tool organizes rules, parsers and autofix | ✅ design-lint: https://github.com/bylapidist/design-lint (read `docs/architecture.md`, `docs/rules/index.md`, `docs/usage.md`) |
| See a simple rule (forbid hex) as an ESLint plugin | ✅ MetaMask design-tokens: https://github.com/MetaMask/design-tokens |
| See how Angular templates are parsed in a linter | ✅ angular-eslint: https://github.com/angular-eslint/angular-eslint |
| CLI good practices | ✅ https://clig.dev |
| Token format | ✅ https://www.designtokens.org/TR/2025.10/ |

---

## Per-phase log template (copy and fill in)

```markdown
## Phase N log: <title>
- Start / end date:
- What I managed to do:
- What I got wrong and how I fixed it:
- What I still don't understand well:
- Decisions made (and why):
- Commit/exercise folder link:
- LinkedIn post (3-line draft):
```

---

## Final project checklist

- [ ] Installable, documented CLI (Phases 0 and 10)
- [ ] CSS/SCSS, React and Angular analysis (Phases 2 to 4)
- [ ] Token reading and validation (Phase 5)
- [ ] Exact and approximate token suggestion, with a justification (Phase 6)
- [ ] Context-aware suggestions: role of the value, relative units, `var()` fallbacks (Phases 6 and 9)
- [ ] Safe, idempotent autofix with `--dry-run` (Phase 7)
- [ ] Tests, fixtures and CI (Phase 8)
- [ ] Token generation with the Nickerson taxonomy (Phase 9)
- [ ] README, `--json` and a published version (Phase 10)
