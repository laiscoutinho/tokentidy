# Implementation plan: 0.0.5 to 0.0.8

Written on 2026-10-23, before any code change. It turns the first versions of the [roadmap](../roadmap.md) into concrete work, plus the `generate` corrections found in the lab. Sources behind each choice are in [research-log.md](../research-log.md#plan-005-to-008-2026-10-23).

## 1. Scope

**In:** what improves the two existing commands (`check`, `generate`) without creating a new command or a new engine.

| Version | Feature | Roadmap |
|---|---|---|
| 0.0.5 | Scope (files and folders, project root), CLI split by command, test infrastructure, security base | 0.0.5 + §10 |
| 0.0.6 | `check` precision: rule ids, review, local custom properties, `color-mix()`, vendor prefixes, `@font-face`, `@keyframes`, breakpoints, minified and unsupported files listed, BOM column | 0.0.6 |
| 0.0.7 | Ignore comments with rule ids, ignored paths in the config | 0.0.7 |
| 0.0.8 | `generate`: scale diagnosis, gray naming, DTCG names reused, `--new` semantics, safe writing | §6.3 + lab findings |

**Out (full features, later versions):** `fix`, SCSS expressions with `sass-parser`, JS flow, CSS-in-JS, React Native, Angular host bindings, the token index (`has-token`, `unknown-token`, design-system packages in `node_modules`), consolidation and coherence guards, micro-frontends, `validate`, report formats, themes. Because 0.0.8 is inserted, every roadmap version from the old 0.0.8 on moves one number up.

## 2. Research-backed choices

Every choice prefers what Node already ships (the `engines` floor rises to 22.20, see below). No new runtime dependency.

| Need | Choice | Discarded | Why |
|---|---|---|---|
| Coverage floor | `node --test --experimental-test-coverage --test-coverage-lines=90 --test-coverage-branches=85` | `c8`, `nyc` | Built in since 22.8, exits 1 below the floor, already measures the CLI child processes (measured: 93% lines, 84% branches today) |
| Glob matching for `ignore` in the config | `path.matchesGlob` | `picomatch`, `minimatch` | Stable since Node 22.20; same engine as `fs.glob`, which the scanner already uses. Raising `engines` from 22.17 to 22.20 costs nothing for Node 22 LTS users |
| Atomic writes | `writeFile` to a temp file in the same folder + `rename`, retry on `EPERM`/`EBUSY` (Windows) | `write-file-atomic` | Same algorithm in ~30 lines; one dependency less to audit |
| Terminal-safe output | `util.stripVTControlCharacters` + escaping of the remaining C0/C1 controls | `strip-ansi` | `strip-ansi` itself points to the built-in |
| Ignore comment syntax | `tokentidy-ignore-line <rules> -- reason` and `tokentidy-ignore-next-line <rules> -- reason` | a bare `tokentidy-ignore` | Same shape as ESLint and stylelint, which users already know; the line it applies to is explicit |
| Minified detection | name `*.min.*`, or average line length above 110 characters | parsing it | GitHub Linguist's `minified_files?` rule, battle-tested on millions of repositories |
| Gray vs. color | nearest color of the Tailwind v4 palette (242 OKLCH values), neutral families (`slate`, `gray`, `zinc`, `neutral`, `stone`) collapsed into `gray` | a fixed chroma threshold | Tailwind's own `gray-900` has chroma 0.034 and `blue-50` has 0.014: no single threshold separates them |
| Scale references | Carbon: 13 spacing steps; Material 3: 15 baseline type styles | — | Material 3 has 15 (display/headline/title/body/label × L/M/S), not 13 as the roadmap said |
| CI | GitHub Actions, `actions/checkout@v7`, `actions/setup-node@v7`, matrix Linux/Windows/macOS × Node 22/24 | — | Current majors (checked against the releases API) |

## 3. Modules

```
src/
├── cli.ts                  # unchanged
├── program.ts              # only assembles the commands and runs main()
├── cli/
│   ├── check.ts            # `check` command
│   ├── generate.ts         # `generate` command (+ mode prompt)
│   ├── print.ts            # display paths, OSC 8 links, safe text, summaries
│   └── errors.ts           # UsageError, EXIT codes
├── scope.ts                # paths → project root + files in scope (new)
├── scanner.ts              # walks one folder: supported, token, minified, unsupported files
├── analyze.ts              # analyzePaths() + analyzeDirectory() (compat)
├── ignore.ts               # ignore directives in a file → filters findings (new)
├── local-properties.ts     # `--x: literal` outside :root → findings (new)
├── fs-safe.ts              # atomic write, confinement to the root (new)
├── rules.ts                # + vendor prefixes, rule ids, review rules, Map lookups
└── generate/
    ├── diagnosis.ts        # distinct values → steps, consistency (new)
    └── palette.ts          # Tailwind v4 palette data (new)
```

Every new file stays under ~300 lines. `program.ts` keeps no logic; everything useful to other programs is exported from `index.ts`.

## 4. Work items

### 0.0.5 — scope, CLI, test infrastructure, security base

1. **Scope** (`scope.ts`):
   - `check [paths...]` and `generate [paths...]`, default `.`. Each path is a file or a folder.
   - Project root = nearest ancestor of the common parent of the paths with `package.json`, `tokentidy.config.json` or `.git`; without one, the common parent itself. Findings are relative to the root, the config comes from the root.
   - A path that doesn't exist → exit 2. A path inside the root that matches nothing → warning on `stderr` (`No supported files in src/x`), exit 0.
   - A file given explicitly is analyzed even when the scanner would skip it by name (`*.test.ts`), because the user asked for it; folders keep the default exclusions.
2. **Scanner fixes:** hidden folders (`.cache`, `.storybook`…) are skipped as the docs already said; symlinked folders are not followed (`fs.glob` doesn't follow them, test added for a loop).
3. **CLI split:** one module per command in `src/cli/`. No behavior change besides the new arguments.
4. **Security base (§10):**
   - `printable()` on every value, path and parser message printed in text mode (control and ANSI characters escaped as `\u001b`). JSON keeps the exact text.
   - Plain-object lookups with keys that come from user files become `Map` (`SQUARE_COUNTERPARTS`, `STYLE_SYNTAX`, `DTCG_TYPES`), so `constructor`/`__proto__` can't hit `Object.prototype`.
5. **Test infrastructure:**
   - Expectation fixtures (`test/fixtures/expect/`): a line marked `/* expect: color/hardcoded */` must produce exactly that rule; `expect: none` must produce nothing; any finding on an unmarked line is a false positive. The test prints false positives and false negatives per rule, and fails if any exists.
   - `npm test` runs with the coverage floor (lines 90%, branches 85%).
   - `.github/workflows/ci.yml`: Linux, Windows, macOS × Node 22, 24; `npm ci`, `npm run check`, `npm audit --omit=dev`.

### 0.0.6 — `check` precision

1. **Rule ids.** Every finding has `rule`: `<type>/hardcoded` (e.g. `color/hardcoded`). Text output becomes `file:line:column<TAB>severity<TAB>rule<TAB>property<TAB>value`, `severity` = `violation` or `review`.
2. **Review** (`AnalysisResult.review`, never fails CI, never feeds `generate`):
   - `size/no-context`: `width`/`height`/`min-*`/`max-*`/`inline-size`/`block-size` with a length that isn't a container or a square;
   - `breakpoint/plain-css`: literal breakpoint in plain CSS, where `var()` doesn't work in a media query;
   - `custom-property/unknown-use`: a local custom property with a literal whose role can't be told.
3. **Local custom properties** (`local-properties.ts`): `.card { --gap: 12px }` is a violation when the block isn't a token block. A token block is `:root`/`html` (with or without qualifiers), a rule with only custom properties that isn't `:host`, or an override of a name defined in one of them. The type comes from where the property is used (`var(--gap)` in `gap` → `spacing`), else from the value (a color), else review.
4. **`color-mix()`:** analyzed inside: `color-mix(in srgb, #4f46e5 80%, white)` → `#4f46e5` and `white`, with `function: color-mix`.
5. **Vendor prefixes:** `-webkit-box-shadow` follows `box-shadow` (`-webkit-`, `-moz-`, `-ms-`, `-o-`).
6. **`@font-face`:** its declarations are the font's definition, not a use: skipped.
7. **`@keyframes`:** `opacity` inside a keyframe is choreography of the animation, not a design decision: skipped. Colors and lengths in keyframes are still reported.
8. **Breakpoints:** new token type `breakpoint`. Lengths in `@media`/`@container` conditions (`(min-width: 768px)`) are findings with property `@media`/`@container`. Violation in SCSS/Sass/Less (a variable works there), review in plain CSS.
9. **Files listed, never dropped** (`AnalysisResult.skipped`): minified (Linguist rule; `includeMinified: true` in the config re-enables them), unsupported languages (`.vue`, `.svelte`, `.styl`, `.stylus`). `.pcss`/`.postcss` are read as CSS. Summary on `stderr`.
10. **BOM:** the column on line 1 no longer counts the BOM (offsets still do, so `slice` stays exact).
11. **Summary on `stderr`:** `N violations, M review in K files` plus the skipped lists.

### 0.0.7 — ignore

1. **Comments** (`ignore.ts`), in any host's comment syntax (`/* */`, `//`, `<!-- -->`, `{/* */}`):
   - `tokentidy-ignore-line color/hardcoded, spacing/hardcoded -- reason`;
   - `tokentidy-ignore-next-line color/hardcoded -- reason`.
   - The directive is found by a text scan restricted to comment openers on the same line, one implementation for every host (each parser exposes comments differently; a directive inside a string is harmless: at worst it ignores what it names).
2. **Warnings** (`AnalysisResult.warnings`, `stderr`, never change the exit code): `ignore/too-broad` (no rule id: ignores nothing), `ignore/unknown-rule`, `ignore/unused` (nothing to ignore on that line).
3. **Config:** `ignore: ["legacy/**", "**/*.generated.css"]`, globs relative to the root, matched with `path.matchesGlob`; validated as an array of non-empty strings.
4. Ignored findings are counted (`ignored` in JSON).

### 0.0.8 — `generate`: diagnosis and corrections

1. **Diagnosis** (`diagnosis.ts`, §6.3): per type, distinct values, steps (tokens), consistency (share of uses on a step). Printed on `stderr`, `diagnosis` in JSON. Above the reference (spacing > 13, font-size > 15) it says so and counts the single-use values.
2. **Gray naming:** nearest Tailwind v4 color decides the family (`#111827` → `gray-900`, not `blue`).
3. **DTCG names reused:** a value already defined in a hand-written `*.tokens.json` becomes a CSS token named after its path (`color.primary` → `--color-primary`, the Style Dictionary convention), with the DTCG token as equivalent, instead of a second name for the same decision.
4. **`--new` semantics (open question closed):** `--new` forgets only TokenTidy's previous output; hand-written tokens are real project decisions and are always reused. The prompt therefore appears only when the output folder already has a `tokens.tokens.json`.
5. **Safe writing** (`fs-safe.ts`): the output folder must be inside the project root (resolved through symlinks), files are written atomically, `--new` deletes only files whose content starts with TokenTidy's header (never a user file in `css/`). A corrupted `tokens.tokens.json` is a clear error (exit 2) with its path, not a stack trace.
6. **Prototype safety in the DTCG tree:** own-property checks in `getAt`/`setAt`/`tokensOf`.

## 5. Cross-cutting checks

- **Security:** no write outside the root; no symlink escape; no `__proto__` lookups; no terminal escapes from user text; config stays JSON only; `npm audit` = 0.
- **Completeness:** every lab scenario in `experimentos/lacunas/` (except `other-langs`, which is listed) becomes an expectation fixture.
- **Scalability:** the scope reads only the paths given; minified bundles are not parsed by default; ignore directives cost one pass over the text only when the file contains `tokentidy-ignore`.
- **Clean code:** one responsibility per module, data in `rules.ts`, `Map` for user keys, comments in Portuguese, everything else in English.
- **Compatibility:** `analyzeDirectory()` and `scanDirectory()` stay in the public API. Breaking changes (text output columns, `findings` without review items) are fine in 0.x and are documented in `commands.md`.

## 6. Done when

- `npm run check` passes (types, tests, coverage floor) and the expectation fixtures report 0 false positives and 0 false negatives.
- `tokentidy check src/Card.css` works; the lab scenarios give the expected output.
- Docs updated: `CLAUDE.md` (decisions), `commands.md`, `roadmap.md` (renumbering, Material 3 count), `research-log.md`, `experience-log.md`.
