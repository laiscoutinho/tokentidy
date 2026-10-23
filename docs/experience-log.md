# Difficulties, challenges and notes during development

## Phase 0: TypeScript, Node and the CLI skeleton

Technical record of what happened in this phase (add your own account).

- **`fast-glob` removed for security.** It depends on `braces`, which has an unpatched denial-of-service (DoS) flaw. The scan switched to Node's own `fs.glob`, stable since 22.17. Lesson: before installing a dependency, check whether Node already solves it and run `npm audit`.
- **CLI output rethought.** The first version showed a banner and a table on every command. It moved to the UNIX philosophy: only the data, one line per record, tab-separated. The banner stayed only in `--help`.
- **`npm link` hides packaging problems.** The link uses the whole project folder. To test like a real user, we started using `npm pack` and installing the `.tgz` in a test project.
- **Inaccurate error message.** `tokentidy check README.md` said "Directory not found", but the path existed, it just wasn't a folder. It became its own error ("Not a directory"), with a test.
- **Migration to TypeScript + ESM (2026-10-12).**
  - `commander` 15 was already ESM-only and worked in CommonJS through a Node workaround (`require` of ESM). `@angular/compiler`, needed later, is also ESM-only.
  - Node 22.18+ runs `.ts` directly, so the `tsx` planned in the guide was no longer needed. But Node doesn't run `.ts` inside `node_modules`, so the published package ships compiled JavaScript (`dist/`).
  - On the very first type check, TypeScript found a wrong use of commander: the banner was printed directly, but `addHelpText` expects to receive the text.
  - `chalk` was replaced by Node's `util.styleText` (one dependency fewer).
- **Build when installing from GitHub.** With the `prepack` script, installing straight from GitHub would leave the package without `dist/`. Switched to `prepare`.
- **Performance leftovers closed (2026-10-13).** `figlet` is now loaded only for help, and `cli.ts` became a minimal entry point that enables the compile cache before importing the rest. The measured gain was small (91 → 88 ms), but the cache now applies to PostCSS, which is much larger.

## Phase 2: CSS and SCSS parsing (v0.0.2)

Technical record of what happened in this phase (add your own account).

- **Value parser replaced after an experiment.** The guide pointed to `postcss-value-parser`. I tested it and `@csstools/css-tokenizer` on the same SCSS (variables, `math.div`, interpolation, `box-shadow` with several shadows, the `font` shorthand). `postcss-value-parser` reads SCSS "naturally", but breaks on interpolation and doesn't tell the value type. `@csstools` follows the spec, delivers each token typed and comes from the same family as the color parser Phase 6 will need. The choice and its reasons are in CLAUDE.md. The experiment scripts are kept in `tcc-labs/testar-tokentidy/v0.0.2/experimentos/`.
- **SCSS arrives in pieces.** A spec-compliant tokenizer reads `$red` as `$` + `red`, and `red` is a valid color. Without handling this, every variable named after a color would be a false positive. Same with `#{...}` (interpolation) and `math.div(...)`.
- **PostCSS hides details that shift positions.** It strips comments from `decl.value` (the original text is in `raws.value.raw`) and drops the BOM at the start of the file. In both cases the offsets would be wrong. A test now guarantees, across all fixtures, that `source.slice(offset, endOffset) === value`.
- **The tokenizer's end offset is inclusive.** In `@csstools`, the end points to the last character; in JavaScript's `slice`, the end is exclusive. Hence the `+1` in `range()`.
- **Tested on real projects.** I ran it on 212 CSS/SCSS files from other projects: 8,638 hardcoded values, no wrong position and no crash. The most repeated values (`font-weight: 600`, `14px`, `#6c757d`) are exactly the token candidates.
- **The folder scan was the bottleneck.** Analyzing 1 MB of CSS took 0.4 s, and the scan took 1.7 s. With one pattern per extension, `fs.glob` walked the tree 7 times. With a single pattern and the extension filter in code, it dropped to 1 s.
- **Exit codes brought forward.** With `check` finding violations, exiting with `0` would let CI pass with problems. It became `0` (clean), `1` (violations) and `2` (usage error).
- **Project switched to English.** CLI messages, docs, tests and fixtures are now in English; only code comments stay in Portuguese.
- **What the real runs showed for later.** The same number means different things depending on where it's used (an `800px` page max-width vs. an `800px` card), relative units (`%`, `vw`) may stand for the same decision as a `rem` elsewhere, and `var()` fallbacks carry values too. All three are recorded as future directions in CLAUDE.md and in the README roadmap.

## Phases 3, 4, 6 and 9: every host and token generation (v0.0.3 and v0.0.4)

Technical record of what happened in this version (add your own account).

- **Priority changed to proofs of concept.** Instead of following the phases in order, the goal became proving the two critical features (generating tokens and autofix) on the lab's projects first. The first `generate` (placeholder names, everything printed) ran on copies of the base projects and showed what was missing:
  - about 70% of the proposed tokens were used **once**: a token for every value only makes the list longer. This led to `minOccurrences` (default 2, configurable);
  - the Angular project already had `$roxo`, `$cinza`, `$borda` in SCSS, and `generate` ignored them. This led to reading existing tokens and reusing them;
  - names like `--color-1` say nothing. This led to the naming research (Tailwind scales, OKLCH hue families).
- **Reusing a token depends on where the value is used.** In the lab, `$roxo` is defined in SCSS but `#4f46e5` is also written in JSX and in an Angular template, where a Sass variable doesn't exist. Rule adopted: reuse only a definition that works in every host; otherwise create a CSS token and record the SCSS variable as its equivalent, even for a single use. The v0.0.4 lab run shows exactly this (`color-indigo-600` with `$roxo` as equivalent).
- **Category became token type.** `color`/`spacing`/`typography` was too coarse to group: `16px` as `font-size` and as `line-height` are different decisions. `check` now reports 16 types, and `--json` uses `type` instead of `kind`.
- **Context entered the rules.** `width` alone is ambiguous, but next to `margin: 0 auto` it's a page container, and equal to `height` it's an icon or avatar size. In the Angular project, `.card { max-width: 420px; margin: 48px auto }` is now a `container`, as anticipated in v0.0.2.
- **`px` and `rem` are not merged.** It's tempting to say `1rem` = `16px`, but that depends on the root font size and on whether the team wanted the value to scale with the user's font. It became a suggestion, and `rootFontSize` is detected from `html { font-size }` or set in the config.
- **DTCG as the source of truth.** The format reached its first stable version (2025.10) in October 2025. The JSON is written first and CSS/SCSS/Less are generated from it, so they never disagree. Everything autofix will need (offsets, host, the function around the value, the implied unit) goes in `$extensions["dev.tokentidy"]`.
- **JavaScript reorders "number" keys.** When building the token tree, `spacing.3` came before `spacing.2_5` no matter the insertion order: in JS objects, integer-like keys always come first. The CSS order is now computed from the values, never from the JSON order.
- **Determinism bug found by a test.** The test that runs `generateTokens` with the findings in reverse order failed: ties (the most used spelling, the order of occurrences) depended on the input order. Fixed by sorting findings by file and offset before grouping.
- **Each parser has its own position quirks.** `sass-parser` rewrites values (`#FFF` becomes `#ffffff`) but keeps the position of the original expression, and its syntax errors carry the position only at the end of the message. Angular `.html` files are templates only when a component points to them with `templateUrl`, so scripts are parsed first. The `slice(offset, endOffset) === value` test now runs on a fixture with every host (`hosts-project`).
- **Nothing waits for a person.** With existing token files, `generate` needs a choice between extending and starting over. In a terminal it asks; in CI, a hook or a pipe it exits with `2` and names the flags (`--extend`/`--new`).
- **TypeScript checked the fixtures.** Fixture `.tsx` files and `@angular/core` imports broke `tsc`. Fixtures are sample projects, not code to compile, so `test/fixtures` was excluded from `tsconfig.json`. `Map.groupBy` required moving `target`/`lib` to `es2024`.
- **Lab results.** `check` went from 17 / 7 / 19 values (v0.0.2) to 27 / 13 / 30 (basic / React / Angular), mostly from inline styles, JSX, Angular templates, `border-radius` and context-based `width`. `generate` proposed 5 / 3 / 7 tokens, every one used at least twice or needed as a CSS equivalent of a Sass variable.

## Planning 0.0.5 to 0.1.0 (2026-10-23)

Technical record of the gap analysis and the planning discussion (add your own account). The plan is in [roadmap.md](roadmap.md); the sources are in [research-log.md](research-log.md).

- **Simulating real scenarios showed the gaps.** Folders with edge cases were created in `tcc-labs/testar-tokentidy/v0.0.4/experimentos/lacunas/` (CSS edge cases, advanced SCSS, real React, real Angular with Material, dark theme, an existing design system in `node_modules`, robustness). What v0.0.4 got wrong:
  - **silent:** `.pcss`/`.styl` files ignored with exit 0; `check` refuses a single file (`Not a directory`);
  - **noise:** an unnamed minified vendor bundle produced 9,750 of 9,754 findings and polluted `generate`;
  - **false positives:** `font-family`/`font-weight` inside `@font-face`, `opacity` inside `@keyframes`;
  - **false negatives:** local custom properties (`--local-gap: 12px`, `--mat-sys-primary: #e53935`), `-webkit-box-shadow`, `@include` arguments and mixin defaults, `mat.*-overrides` maps, `@media` breakpoints, style objects in variables, styled-components, Emotion, `sx`, vanilla-extract, SVG `fill`/`stroke`, `'--x'` keys in style objects, Angular `host: {}` and `@HostBinding`;
  - **wrong output:** `color-mix()` reported whole; a typo in a token reference (`--acme-color-primay`) not caught; the design system's tokens in `node_modules` invisible, so `generate` duplicated them; an existing DTCG token not reused; `15px`/`17px` became their own tokens (`spacing-3_75`, `spacing-4_25`); `#111827` named blue instead of gray; dark theme produced no semantic aliases; the BOM shifted column 1 by one.
  - The offset invariant held: 0 mismatches across 9,858 findings, including BOM, CRLF, emoji and paths with spaces.
- **"Skip it" was rejected as a solution.** The first plan skipped React Native (no `var()`), Sass functions and breakpoints. The decision was that every hard case needs a real solution, and a case without a known solution becomes a research item, not a removal. Hence the `tokens.ts` module for React Native and canvas libraries, `$x` inside Sass functions, and consolidation of the literal in plain-CSS media queries.
- **Too many tokens is a symptom.** A project with 27 different spacings doesn't need 27 tokens; it needs to know it has no pattern. Consolidation and the scale-health summary came from this.
- **"Close values" needed a definition.** Different cards may have different paddings on purpose. The line drawn: two on-grid values are two decisions; an off-grid value next to an on-grid one is inconsistency. For colors, the CSS Color 4 just noticeable difference (ΔEOK 0.02), with the most used color as representative.
- **A value can't be judged alone.** Changing `15px` to `16px` is harmless alone, but can turn a "squish" button square, merge a hover color into its base color, or break the nested radius of a card. This led to the element model and the coherence guards. There is no single standard for "looks odd", so the guards keep relationships (orders, equalities, contrast thresholds) instead of guessing sizes, and the size tolerance is an open research item (R1).
- **Review had to stay small.** Sending every uncertain case to review would avoid false positives but make the certain set too small. Review is now limited to two reasons the code can't answer, and its share is a metric per version.
- **JavaScript needs data flow.** Reporting every object with style-like keys catches `resize({ width: 300 })`; reporting only `style={{}}` misses most real code. Following each object to its destination (Babel scope analysis) solves both.
- **Authorization without breaking automation.** Approximate changes need a "yes", but `check`/`fix` must run in CI. A prompt only in a terminal, `--yes`/`--no-input` outside it, and saved answers so a team isn't asked twice.
- **Vue and Svelte left the scope.** Their files are listed as unsupported in the summary, never silently dropped.

## Implementing 0.0.5 to 0.0.8 (2026-10-23)

Technical record of the implementation of [plan-0.0.5-0.0.8.md](plan-0.0.5-0.0.8.md) (add your own account).

- **The expectation fixtures caught the fixture, not the code.** The first run of `test/fixtures/expect/` showed false negatives on rules with only custom properties (`.kk { --x: 4px }`). By design, such a rule is a token block. The fixture lines were wrong; `display: block` was added so they are ordinary rules, and a separate `expect: none` line covers the token-block case. Lesson: the expectation must follow the documented decision, so the decision has to be written before the fixture.
- **Fixtures needed a project root.** With root detection, a fixture without `package.json` resolved to the TokenTidy repository itself and reported paths like `test/fixtures/css/a.css`. Each fixture now has `{ "private": true }`.
- **The coverage floor failed at first** (branches 82.7% < 85%). The gaps were new modules without their own tests (`ignore.ts`, `fs-safe.ts`, `print.ts`, `diagnosis.ts`). After adding them, 154 tests, 94% lines and 86% branches. The floor did its job: it made untested safety code visible.
- **`--new` was cleaning only in one mode.** While writing the safe-write rules, it became clear that stale generated files (`css/*.css` after the split goes away) are stale in `--extend` too. Both modes now remove them, and only when the file carries TokenTidy's header.
- **The palette fixed the family, not the step.** `#111827` is now `gray` (it was `blue`), but its step comes from TokenTidy's lightness table, which gives `gray-950`, not Tailwind's `gray-900`. The family was the bug; the step table is a separate decision, kept as it is.
- **Out of scope** (decided after this round): `filter: drop-shadow()`, `text-underline-offset`, position offsets (`top`/`left`/`inset`/`translate`) and unitless `stroke-width`. The tool stays on numeric scale values; positional and effect-specific values are not design-scale decisions.
