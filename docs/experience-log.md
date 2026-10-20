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
