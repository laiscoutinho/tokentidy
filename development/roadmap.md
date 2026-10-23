# Roadmap: from 0.0.5 to 0.1.0

> 0.0.5 to 0.0.8 are implemented ([plan](plans/plan-0.0.5-0.0.8.md)); 0.0.9 is `fix` ([plan](plans/plan-0.0.9.md)). `fix` moved up from 0.0.15 and the sizing properties came in as 0.0.10, so the versions after them were renumbered (2026-10-23). The token freshness check came in as 0.0.11 and the later versions moved up one again (2026-10-23).
>
> Scope decided on 2026-10-23: the scan covers numeric scale values. `duration`, `easing` and `container` stay. Keyword values such as `position: absolute` are design-independent and are never scanned.

Plan agreed on 2026-10-23. It guides the next versions. Decisions behind it are in [CLAUDE.md](CLAUDE.md#principles), the research that supports them is in [research-log.md](research-log.md), and the difficulties found along the way are in [experience-log.md](experience-log.md).

Each version is one patch (`0.0.x`) with one feature. `0.1.0` comes only when everything below is done.

---

## 1. Goal

**Visual consistency across every screen**, including across micro-frontends: a reasonable number of tokens that represent the project's real design decisions, applied the same way everywhere, **without making anything look odd**.

## 2. Principles

1. **A substitution may change a value, never a relationship.** Before replacing a value, TokenTidy looks at the whole element and its neighbors: padding against gap, inner radius against outer radius, text against background, hover against base, heading sizes against each other. If a relationship that held before would break, the substitution is blocked and the reason is shown.
2. **Certainty is large, review is small.** A finding is a *violation* when TokenTidy is sure. *Review* is only for what the code itself cannot tell (see [§5](#5-what-goes-to-review)). The way to shrink review is to analyze more context, never to hide findings.
3. **Nothing is "not supported, skipped".** Every hard case gets a solution, even if it is not `var()`. When the solution isn't known yet, it becomes a research item ([§8](#8-open-research)) with a plan, and the case stays visible in the output.
4. **Fewer, coherent tokens, not a minimum.** The token count follows the project's size and its real decisions. A scale with too many values is reported as a diagnosis ("this project follows no pattern here"), and values that differ only by inconsistency are consolidated.
5. **Approximate changes need authorization.** Exact replacements (`16px` → the `16px` token) can be applied by `fix`. Approximate ones (`15px` → the `16px` token) are always shown first and applied only when the user says yes.
6. **Nothing depends on a person in CI.** Every prompt has a flag equivalent. Prompts only appear when `stdin` is a terminal.

## 3. Closed scope

**In:** CSS, SCSS, Sass, Less, plain HTML, JavaScript, TypeScript, React (JSX/TSX, CSS-in-JS), React Native, Angular (templates, components, Angular Material). Inline styles in every one of them.

**Out:** Vue and Svelte single-file components, Stylus, PostCSS-only syntaxes (`.pcss` is read as CSS), Tailwind classes, a VS Code extension, AI, CSV output, `--changed`, CIEDE2000 (OKLab is used), the "swap `var()` for the raw value" benchmark, custom formatter plugins (they run arbitrary code), positional and effect-specific values (`top`/`left`/`inset`, `transform`, `filter`, `text-underline-offset`, `stroke-width`): the scan covers numeric scale values. Files of out-of-scope languages are **listed** in the summary (`2 files in unsupported languages: …`), never silently dropped.

**Later (after 0.1.0):** baseline file, SARIF output.

## 4. How the hard cases are solved

| Case | Solution |
|---|---|
| React Native (no `var()`) | `generate` writes a `tokens.ts` theme module from the same DTCG file. `fix` replaces `padding: 16` with `padding: spacing[4]` and adds the `import`. Works in `StyleSheet.create`, `style={{}}` and `Platform.select` |
| Sass/Less build-time functions (`math.div`, `darken`, custom `rem()`) | Use the preprocessor variable (`$spacing-8`) inside the function; `var()` everywhere else |
| `@media`/`@container` conditions (`var()` doesn't work there) | SCSS/Less: preprocessor variable. Plain CSS: consolidate the literal itself (`767px` → `768px`, with authorization). JS `matchMedia` is detected too |
| Canvas and chart libraries (Chart.js `backgroundColor`) | Colors are visual, but `var()` doesn't work in a canvas. `fix` uses the `tokens.ts` module, as in React Native |
| Design-system tokens from npm packages | Follow `@import`/`@use` into `node_modules` and read only those files |
| A token overridden by a theme (`.dark { --color-bg: … }`) | The token index knows where each token is defined and overridden. `fix` only replaces when the token resolves to the same value in that element's context |
| Local custom properties (`.card { --gap: 12px }`, `:host { --mat-sys-primary: #e53935 }`) | Literal values are violations; `var()` values are correct component tokens |
| `@font-face` | Source of `font-family` tokens, not a violation |
| `color-mix()`, vendor prefixes | Analyze inside `color-mix()`; prefixed properties follow the unprefixed rules |
| Minified or generated files | Not analyzed by default, **listed** in the summary, re-enabled in the config |

### Inline and in-code styles, per language

The rule for JavaScript is: **TokenTidy follows where an object goes before deciding what it is.** The same key name means different things depending on the destination:

| Destination | Example | Result |
|---|---|---|
| A style slot | `const card = { padding: 16 }` … `<div style={card}>` | violation, fixed with `var()` (web) or the token module (React Native) |
| A canvas or chart library | `new Chart(el, { data: { datasets: [{ backgroundColor: '#4f46e5' }] } })` | violation for colors, fixed with the token module |
| Something that is not visual | `sharp(img).resize({ width: 300 })`, `logger({ color: true })`, `window.open(url, '', 'width=600')` | not a style, not reported |
| Unknown (the object is passed to a function TokenTidy can't follow) | `configure({ width: 320 })` | colors: violation (a hex is visual). Numbers: review |

Without following the variable, TokenTidy would either report the `resize({ width: 300 })` (a false positive) or skip every object outside `style={{}}` (poor coverage). Following it gives both precision and coverage. Babel's scope analysis (`@babel/traverse`) does the following, including relative imports.

| Where | Read with |
|---|---|
| `style={{}}`, `[style.x]`, `[ngStyle]`, `style=""` | already done |
| Style objects in variables and imports, `StyleSheet.create`, `Platform.select` | `@babel/traverse` (new, loaded only for JS files) |
| styled-components, Emotion `css```, `css` prop | each `${…}` becomes a placeholder of the same length, then PostCSS (offsets stay exact) |
| MUI `sx` | strings with a unit or a color only; `p: 2` is already a theme step |
| DOM: `el.style.x =`, `setProperty`, `cssText`, `setAttribute('style')`, `Object.assign(el.style, …)` | Babel |
| Angular `host: {}`, `@HostBinding('style.x')`, `Renderer2.setStyle`, `[style]="{…}"` | Babel + `@angular/compiler` |
| Angular Material `mat.*-overrides((key: value))`, mixin arguments and defaults | `sass-parser` (already a dependency); the map key gives the type (`*-color` → color) |
| SVG `fill`/`stroke` in HTML, JSX and templates | parse5, Babel, Angular |
| Existing JS themes (`createTheme`, `ThemeProvider` objects) | read as token **sources** |

`.scss` moves from `postcss-scss` to `sass-parser`, which has a full expression tree with offsets (tested: `@include` arguments, maps with keys, `math.div`, numbers with units).

## 5. What goes to review

Only what the code cannot tell:

- `width`/`height` without context (not a container, not a square, not in a known component);
- numbers in JS objects whose destination TokenTidy cannot follow.

Review items are printed, counted in the summary, and never fail CI. **The share of review is a metric**: it is measured in the lab every version and must go down. Every review reason has an id and a research item in [§8](#8-open-research).

## 6. Consolidation and visual coherence

### 6.1 What is "discrepant"

Several kinds of card can have different paddings (`16px` on a compact card, `24px` on a feature card). That is a design decision. What breaks coherence is a value that is **almost** another one: `15px`, `16px`, `17px` on cards. The rule:

- **Measures:** an on-grid value (a multiple of `gridBase`) is a valid step and is **never merged automatically** with another on-grid value. An off-grid value is discrepant and is absorbed by the nearest on-grid value **used in the same role** (type + property family + component family). If there is none, by the nearest grid step. A tie (`14px` between `12px` and `16px`) goes to the value more used in that role, then to the one on the coarser grid (`16px` is a multiple of 8). If it still ties, the prompt offers both.
- **Colors:** two colors are discrepant when their OKLab distance (ΔEOK) is at most `colorTolerance` (default `0.02`, the CSS Color 4 "just noticeable difference"). The representative is the color **used most across the whole project**. Each color joins the most used color within the tolerance, not its nearest neighbor, so chains (a≈b≈c with a≠c) don't form.
- **Units:** if most `font-size` values are `rem`, the token is `rem`; equivalent `px` values become approximate.

### 6.2 Coherence guards

Before any approximate substitution (and before `generate` consolidates), TokenTidy builds an **element model**: for each rule or element, its paddings per side, gap, margins, radius, border width, font size, line height, colors (text, background, border) and states (`:hover`, `:focus`, `:active`), plus the parent/child links it can see (descendant selectors, JSX/HTML/Angular nesting). It computes the relationships that hold **before**, applies the candidate change, and checks them **after**:

| Guard | Holds before → must hold after | Source |
|---|---|---|
| Distinct states | `:hover`/`:active`/`:focus` color stays distinguishable from the base color (ΔEOK above the tolerance). Merging them would remove the feedback | CSS Color 4 (ΔEOK) |
| Contrast | text/background (and border/background for controls) stay at or above the WCAG threshold they met: 4.5:1 text, 3:1 large text and UI components, computed without rounding | WCAG 2.2, 1.4.3 and 1.4.11 |
| Inset shape | `padding: 8px 16px` (a "squish") doesn't become square; side order (vertical < horizontal, or equal) is kept | Curtis, *Space in Design Systems* |
| Spacing hierarchy | inner spacing vs. gap vs. outer margin keep their order; equal values stay equal | Gestalt proximity (NN/g) |
| Nested radius | if `inner = outer − padding` held (or `inner ≤ outer`), it still holds | Cloud Four, nested corners |
| Type scale | heading/text sizes keep their order (`h1 > h2 > h3`); the line-height/font-size ratio stays within 5% | ordering of the scale |
| Variants | two variants of one component that had different values (`btn-sm` vs `btn-md`) never collapse into the same step | — |

A blocked substitution is shown with its reason (`blocked: merges .btn:hover with .btn`) and is not applied. It is not review: the decision is made, and explained.

**States written in code**, not only pseudo-classes, count for the distinct-states guard ([research](research-log.md#25-absorbing-the-token-gap-literature)). Iris's repairs failed where the color depended on state, so the model must see every state the code can tell:

- both branches of a ternary (`isActive ? '#4f46e5' : '#6366f1'`) are two states of one slot;
- Angular `[ngClass]` and `[class.x]="cond"` bindings, and a React `className` built from a condition, link the base rule with the class turned on;
- modifier classes on the same block (`.btn--active`, `.is-open`, `.has-error`) are states of `.btn`, decided by the state words already in `semantic.ts`. A class that isn't on that list is a variant, not a state (guard *Variants*).

### 6.3 Token count as a diagnosis

`generate` prints, per category, how many distinct values exist, how many steps the scale becomes, and the **consistency** (share of uses already exactly on a step):

```
spacing    27 distinct values → 9 steps    consistency 64%
font-size  14 distinct values → 7 steps    consistency 71%
color      31 distinct values → 12 colors  consistency 88%
```

Reference ranges, used for comparison only, never as a limit: Carbon has 13 spacing steps, Material 3 has 15 baseline type styles (display/headline/title/body/label × L/M/S). Above the reference range, the summary says so and points to the values that look like noise.

### 6.4 Authorization

Approximate changes are grouped by role and shown as a diff:

```
.card padding: 15px ×3, 17px ×1 → var(--spacing-4) (16px)
  src/Card.css:12:12        padding: 15px → var(--spacing-4)   +1px
  src/CardFooter.css:4:12   padding: 17px → var(--spacing-4)   -1px
  kept: padding ≥ gap, squish shape, inner radius = outer − padding
Apply? [y]es [n]o [a]ll in this group [q]uit
```

- In a terminal, the user answers per group. Answers are saved in `tokentidy.decisions.json` (committed, so the team shares them); a rejected suggestion isn't asked again.
- Outside a terminal: `--yes` applies every approximate change that passes the guards; `--no-input` never asks and only lists them. Without either, `fix --approximate` exits with `2` and names the flags.
- The node built-in `readline/promises` is enough for the prompt: no new dependency.

## 7. Micro-frontends

Custom properties on `:root` are shared by every micro-frontend on the page, and the recommended way to share tokens is a versioned package. Three problems follow, and TokenTidy targets them:

| Problem | Example | What TokenTidy does |
|---|---|---|
| Drift | shell `#4f46e5`, checkout `#4f46e6` for the same role | analyzes several projects together and reports the same role with different values |
| `:root` collision | two MFEs define `--color-primary` differently; the last stylesheet loaded wins | the same token name with different values across projects is a violation |
| Design-system versions | `@acme/tokens@1.2` in the shell, `@1.4` in checkout | compares versions declared in each `package.json` |

```bash
tokentidy check apps/shell apps/checkout apps/profile   # or detected from package.json workspaces / angular.json projects
tokentidy generate . --shared packages/tokens           # used in 2+ MFEs → shared package; used in 1 → local token
```

Consolidation and coherence guards run across projects too.

## 8. Open research

Items without a confirmed answer yet. Each one is investigated and tested in the lab **before** the version that depends on it. None of them is a reason to drop the feature.

| Id | Question | Needed by | First step |
|---|---|---|---|
| R1 | How much change in a spacing or radius is noticeable? The guards use orderings and equalities; is a size tolerance also needed? | 0.0.18 | screenshots before/after on lab copies, measure what looks different. Same lab run: a script that runs consolidation with `colorTolerance` 0.01 / 0.02 / 0.03 and the grid at 4 / 8, and lists which groups change, to calibrate the defaults (lab only, never in the CLI output) |
| R2 | How far to follow JS objects (props passed down, re-exports, spread)? | 0.0.13 | list real patterns from lab and open-source projects; set a depth limit |
| R3 | Contrast when the background is on an ancestor the stylesheet doesn't name | 0.0.18 | use template/JSX nesting; otherwise check against the nearest known background |
| R4 | Visual verification in the lab (which screenshot tool, kept outside the package) | 0.0.18 | compare options; it is a lab tool, not a dependency |
| R5 | `sass-parser` is 0.x: how stable is the expression AST across releases? | 0.0.12 | pin the version, snapshot tests on the AST shapes we read |
| R6 | Standalone `.svg` files with fixed colors (used via `<img>`, `var()` can't reach them) | 0.0.13 | count them in the lab; candidate: report and fix only when the SVG is inlined |
| R7 | DTCG Resolver `version` string: draft says `2025.10`, final report differs | 0.0.24 | check the published schema before writing |
| R8 | Role families for components with different names (`.card`, `.tile`, `.panel`) | 0.0.19 | test on lab projects; the selector word list already exists in `semantic.ts` |

## 9. Versions

Each row lists what is delivered and how to check it objectively. `npm run check` (types + tests + coverage floor) must pass on every version.

| Version | Delivers | Done when |
|---|---|---|
| **0.0.5** ✅ | Scope: one or more folders or files, project root detection, warning when nothing matches. `program.ts` split into one module per command. Test infrastructure: fixtures with expectations (`/* expect: color */`, `/* expect: review */`, `/* expect: none */`), coverage floor (lines 90%, branches 85%), CI on Linux/Windows/macOS | `tokentidy check src/Card.css` works; `npm test` reports false positives and false negatives per rule as 0 |
| **0.0.6** ✅ | `check` precision: rule ids, `review`, local custom properties, `color-mix()`, vendor prefixes, `@font-face` as source, breakpoints, minified files listed, BOM column, unsupported files listed | every scenario in `experimentos/lacunas/` (except `other-langs`) is a fixture and passes |
| **0.0.7** ✅ | Ignore: comment with rule ids (`/* tokentidy-ignore-line color/hardcoded -- reason */`, `tokentidy-ignore-next-line`) and folders/files in the config | an ignored line disappears; an ignore without a rule id is reported as too broad |
| **0.0.8** ✅ | `generate`: scale diagnosis (§6.3), gray naming by nearest palette color, hand-written DTCG names reused, `--new` forgets only TokenTidy's output, safe writing (atomic, inside the root, never a user file) | `#111827` → `gray`; `--out ..` exits with 2; a corrupted DTCG file is a clear error |
| **0.0.9** | `fix` (exact values, web): `var()` in CSS and inline styles, `$x`/`@x` where Sass/Less need a build-time value (functions, arithmetic, breakpoints) with the `@use`/`@import` added, JSX numbers and strings, the Angular unit suffix (`[style.width.px]`), theme-override check, `--dry-run` as a unified diff, atomic writes inside the root, reparse before writing | after `fix`: every file still parses, a second `fix --dry-run` is empty, the lab apps still build |
| *before 0.0.10* | **Compile tests** (a `test:` commit, no version of its own). The reparse before writing checks syntax, not the build: `darken(var(--x))` parses and fails in Sass ([§22](research-log.md#22-where-var-breaks-sass)). `sass` and `less` become **devDependencies only** (not shipped, not in users' `npm audit`); tests compile the SCSS/Sass/Less fixtures after `fix`, plus the generated `_tokens.scss` and `_tokens.less`, on the 3 CI systems. The `tokens.ts` type-check stays in 0.0.20 | every fixture fixed by `fix` compiles with Dart Sass and Less; a test with `darken(var(--x))` written on purpose fails |
| **0.0.10** | Sizing properties ([research](research-log.md#19-sizing-properties)): `width`/`height` of a control, icon or avatar → `size`; `min-height`/`min-width` touch targets → `size`; `max-width` of a container or overlay → `container`; `scroll-margin`/`scroll-padding` and `border-spacing` → `spacing`. `text-indent`, `flex-basis`, `column-width` and `outline-offset` stay out | `.btn { height: 40px }` → `size`; `min-height: 44px` → `size`; `.modal { max-width: 560px }` → `container`; `.card { width: 300px }` stays in review |
| **0.0.11** | Token freshness in `fix` and `check`: the values left without a token are split in two, *used once* (below the `generate` threshold, no token by design) and *repeated without a token* (the code changed after `generate`). The second group means the tokens folder is out of date: the summary says how many and to run `tokentidy generate --extend`; `--json` lists them. Same rule and threshold as `generate`, so the two commands always agree | after adding a second `margin: 20px` to a fixed lab copy, `fix` reports `1 repeated value has no token yet`; right after `generate`, it reports 0 |
| **0.0.12** | SCSS/Less expressions with `sass-parser`: mixin arguments and defaults, `mat.*-overrides` maps, build-time functions | `@include btn(#f59e0b, 10px)` gives 2 findings with exact offsets |
| **0.0.13** | JS/TS: style objects followed by scope and imports, DOM styles, SVG attributes, canvas/chart colors | `resize({ width: 300 })` → nothing; `style={card}` → findings in `card` |
| **0.0.14** | CSS-in-JS: styled-components, Emotion, `css` prop, MUI `sx` | offsets exact inside template literals; `sx={{ p: 2 }}` → nothing |
| **0.0.15** | React Native detection: `StyleSheet.create`, inline, `Platform.select`, unitless numbers | RN fixture passes with 0 false positives |
| **0.0.16** | Angular: `host`, `@HostBinding`, `Renderer2.setStyle`, `[style]` objects | Angular fixture passes |
| **0.0.17** | Token index: project, DTCG, npm packages, JS themes, theme overrides; `has-token`/`no-token`; `unknown-token` with "did you mean". **Deprecated tokens:** `$deprecated` (boolean or string, DTCG 2025.10) is read, and `check` warns on each `var()`/reference to one, with the explanation string when there is one; `fix` never replaces it automatically (the string explains, it doesn't point to a replacement). **Primitive where a semantic alias exists:** `.error { color: var(--color-red-500) }` while `color.text.danger → {color.red.500}` exists becomes a suggestion (never fails, `fix` doesn't touch existing references), with the same unambiguous-role rule as the aliases. **Provenance in `fix --json`:** each replacement gets `definedAt` (file:line of the token) and `reason` (`same value; most used of 2 project tokens`); the diff and the text output don't change | `--acme-color-primay` → `did you mean --acme-color-primary`; a `$deprecated` token used in CSS → 1 warning, 0 edits; `fix --json` has `definedAt` on every replacement |
| **0.0.18** | Element model and coherence guards, with states written in code (ternaries, `[ngClass]`/`[class.x]`, conditional `className`, modifier classes; [§6.2](#62-coherence-guards)) | each guard has a fixture where it blocks and one where it allows; `isActive ? a : b` with close colors is blocked |
| **0.0.19** | Consolidation in `generate`, `near-token` in `check`, `fix --approximate` with prompt, `--yes`, `--no-input`, `tokentidy.decisions.json` | 15/16/17px on cards → 1 token; `.btn:hover` color is never merged with `.btn`; a rejected group isn't asked again |
| **0.0.20** | `tokens.ts` module and `fix` for React Native and canvas libraries | RN fixture: `padding: 16` → `spacing[4]` with the import, and it type-checks |
| **0.0.21** | Micro-frontends: several roots, workspaces, drift, `:root` collisions, design-system versions, `generate --shared` | two-MFE fixture reports the collision and the drift |
| **0.0.22** | `validate` against the DTCG 2025.10 schema and reference rules (broken aliases, cycles, types) | invalid fixtures fail with the JSON path of the problem |
| **0.0.23** | Reports: `--summary`, `--format github`, `schemaVersion` in `--json` | GitHub annotations escaped; JSON keeps its schema version |
| **0.0.24** | Themes (light/dark) with the DTCG Resolver Module | dark-theme fixture produces semantic tokens per mode |

**Considered and left out** (2026-10-23, [research](research-log.md#25-absorbing-the-token-gap-literature)):

| Idea | Why not |
|---|---|
| Role mismatch: a background token used in `color` | real false positives: a primary button uses `var(--color-bg)` as its text color on purpose, and hand-written names vary (`--surface`, `--fundo`, `--on-primary`) |
| Clustering sensitivity shown in the CLI | noise for the user; the 0.0.19 prompt already shows each distance. It becomes the R1 lab script |
| Evaluation on a project's commit history | discarded |
| Figma/design-file sync, LLM extraction from documents, knowledge graphs, deep-learning smell detection | out of scope: no AI and no design tools ([§3](#3-closed-scope)) |

**Growth:** one new runtime dependency (`@babel/traverse`, loaded only for JS). Commands go from 2 to 4 (`check`, `generate`, `fix`, `validate`). The hardest pieces (scope following, element model, consolidation) live in their own folders (`scan/flow/`, `coherence/`, `consolidate/`), with files of at most ~300 lines.

## 10. Security and output (applies to every version)

- Writes only inside the project root, never through symlinks that leave it; atomic writes (temp file + rename) keeping CRLF, BOM and file mode; reparse before writing; overlapping edits are skipped and reported.
- Alias cycles and depth limits; `Map` instead of plain objects for user keys (`__proto__`).
- Control and ANSI characters stripped from printed values; GitHub annotations escaped.
- Config is JSON only; no plugins or custom formatters.
- `npm audit` stays at 0.
- Output follows the UNIX rules in [CLAUDE.md](CLAUDE.md#command-output-unix-philosophy): data on `stdout`, messages on `stderr`, `--json` pure, exit codes 0/1/2.
