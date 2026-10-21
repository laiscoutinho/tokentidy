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
