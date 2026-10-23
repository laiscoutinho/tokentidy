# Research log

What was researched, why, where, and what each source contributed. Every decision in [CLAUDE.md](CLAUDE.md) and [roadmap.md](roadmap.md) that depends on outside information points here. Add an entry whenever a new source is consulted, including sources that turned out to be wrong or inconclusive.

Format of each entry: **difficulty** → what was searched → sources (link + what was taken from it) → decision.

---

## 2026-10-23: planning 0.0.5 to 0.1.0

### 1. DTCG output and validation

- **Difficulty:** `validate` needs an authoritative definition of a valid token file, and themes (light/dark) need a standard way to describe modes.
- **Searched:** the official DTCG JSON Schema and the Resolver Module.
- **Sources:**
  - [DTCG 2025.10 format schema](https://www.designtokens.org/schemas/2025.10/format.json): official JSON Schema (draft-07). `validate` will check against it instead of writing our own rules for the structure.
  - [DTCG Resolver Module 2025.10, final report](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) and [draft](https://www.designtokens.org/tr/drafts/resolver/): describes themes and modes as *sets* and *modifiers* combined by a `resolutionOrder`. Basis for 0.0.21 (themes).
  - [Terrazzo: resolver contexts](https://terrazzo.app/docs/guides/resolver-contexts/): an existing tool's implementation of the resolver, used to understand how modifiers are applied in practice.
- **Inconclusive:** the draft says version `2025.10` and the final report carries a different date string. Open item R7 in the roadmap.

### 2. Reading SCSS expressions (mixins, maps, build-time functions)

- **Difficulty:** `postcss-scss` exposes `@include btn(#f59e0b, 10px)` and `mat.button-overrides((filled-container-color: #e53935))` as plain text, so the values inside had no positions and were not reported. Sass functions (`math.div(32px, 2)`, `darken()`) run at build time, so `var()` inside them breaks the build.
- **Searched:** whether an existing dependency already parses Sass expressions with positions.
- **Source:** a local probe of `sass-parser` 0.4.57 (already a dependency for `.sass`) in the scratchpad. `scss.parse()` returns `include-rule` (with `includeName` and `arguments`), `mixin-rule`, `function-call`, `map`/`map-entry` (key + value), `number` with unit and `color`, each with offsets.
- **Decision:** `.scss` moves to `sass-parser`; no new dependency. Inside build-time functions, `fix` writes the Sass variable. Risk: the parser is 0.x (open item R5).

### 3. Following style objects in JavaScript

- **Difficulty:** `const card = { padding: 16 }` used in `style={card}` was not reported. Reporting every object with a `width` key would create false positives (`resize({ width: 300 })`).
- **Searched:** Babel's current release and scope analysis.
- **Sources:**
  - [Babel blog](https://babeljs.io/blog) and [7.29.0 / 8.0 notes](https://babeljs.io/blog/2026/01/31/7.29.0): Babel 8 is released and ESM-only, same family as `@babel/parser` 8, already used. `@babel/traverse` gives bindings and references, which is what following a variable needs.
  - [Chart.js colors](https://www.chartjs.org/docs/latest/general/colors.html): dataset options take `backgroundColor`/`borderColor` and draw on a canvas. Shows that a "style-looking" object can be visual but unable to use `var()`.
- **Decision:** follow each object to its destination (style slot, canvas/chart library, non-visual call, unknown). Canvas colors are fixed through the generated `tokens.ts` module.

### 4. React Native

- **Difficulty:** React Native has no CSS custom properties, so `var()` can't be the fix.
- **Source:** [React Native: PlatformColor](https://reactnative.dev/docs/platformcolor): the native way to reference system colors; `DynamicColorIOS` handles light/dark. Confirms that tokens in RN are JS values, not CSS.
- **Decision:** generate a `tokens.ts` theme module from the DTCG file; `fix` replaces values with references to it and adds the import.

### 5. Micro-frontends

- **Difficulty:** the goal is consistency across screens, and in micro-frontends each team ships its own CSS. How tokens are shared, and what breaks, decides what TokenTidy should check.
- **Sources:**
  - [single-spa: CSS](https://single-spa.js.org/docs/ecosystem-css): custom properties on `:root` are global to every application on the page. Basis for the `:root` collision check.
  - [Steve Kinney: design systems across microfrontends](https://stevekinney.com/courses/enterprise-ui/design-systems-across-microfrontends): recommends tokens as a versioned package rather than runtime sharing. Basis for `generate --shared` and the version comparison.
  - [Relia Software: micro-frontend best practices](https://reliasoftware.com/blog/react-micro-frontend-best-practices) and [LogRocket: Module Federation](https://blog.logrocket.com/solving-micro-frontend-challenges-module-federation): style leaks and inconsistent design systems listed as common problems.
- **Gap found:** no source covered two MFEs defining the same `:root` variable with different values (the last stylesheet loaded wins). TokenTidy can detect it statically.

### 6. How many tokens is reasonable

- **Difficulty:** too many tokens means the project follows no pattern; too few loses real decisions. A reference was needed for a "reasonable" scale size.
- **Sources:**
  - [Carbon: spacing](https://carbondesignsystem.com/elements/spacing/overview/): 13 spacing steps, 2px to 160px, on multiples of 2/4/8.
  - [Material 3 Typography (Compose)](https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography): 13 baseline type styles.
- **Decision:** used only as comparison in the scale-health summary, never as a hard limit.

### 7. Visual coherence of a substitution

- **Difficulty:** replacing `15px` with `16px` may be harmless alone but odd together with the element's other values. Needed rules that say when a combination stops "fitting".
- **Searched:** spacing vocabulary in design systems, nested radius, contrast, perceptual color difference, proximity.
- **Sources:**
  - [Nathan Curtis, *Space in Design Systems* (EightShapes)](https://eightshapes.com/articles/space-in-design-systems/): spacing as inset, squish, stretch, stack, inline. A "squish" has less vertical than horizontal padding. Basis for the **inset shape** guard. The [Medium copy](https://medium.com/@nathanacurtis/space-in-design-systems-188bcbae0d62) returned 403; the EightShapes copy was used. [Pit Viper](https://pitviper.turquoise.health/visual-style/spacing/) applies the same vocabulary. [UCLA's system](https://designsystem.brand.ucla.edu/build/v2.6.0/docs/layout/spacing.html) swaps stack and inline, so only the inset concept is relied on.
  - [NN/g: Gestalt proximity](https://www.nngroup.com/articles/gestalt-proximity/): items close together are read as one group, and proximity can override color or shape. Basis for the **spacing hierarchy** guard (inner vs. outer spacing keep their order). NN/g gives no pixel ratio, so the guard keeps orderings, not sizes (open item R1).
  - [Cloud Four: the math behind nesting rounded corners](https://cloudfour.com/thinks/the-math-behind-nesting-rounded-corners/): `inner radius = outer radius − gap`. Basis for the **nested radius** guard. Other sources ([CSS-Tricks](https://css-tricks.com/?p=15151), [30 seconds of code](https://30secondsofcode.org/css/s/nested-border-radius)) add the border width to the gap and note it doesn't apply to radius 0 or fully round shapes.
  - [WCAG 2.2: Understanding contrast (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for text, 3:1 for large text (18pt, or 14pt bold), ratios **not rounded**. [WCAG: non-text contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast): 3:1 for UI components against adjacent colors. Basis for the **contrast** guard.
  - [CSS Color 4](https://www.w3.org/TR/css-color-4/): ΔEOK is the Euclidean distance in OKLab; the spec's gamut mapping uses a just noticeable difference of 0.02 (its changelog explains "one JND for Oklab is 0.02, not 2"). Implementation reference: [Servo's gamut.rs](https://doc.servo.org/src/style/color/gamut.rs.html) uses `JND = 0.02`. Basis for `colorTolerance` and the **distinct states** guard.

### 8. Asking for authorization in a CLI

- **Difficulty:** approximate substitutions need a "yes", but the tool must keep working in CI with nobody to answer.
- **Sources:**
  - [Command Line Interface Guidelines](https://clig.dev/): prompt only when `stdin` is a TTY; `--no-input` disables prompts; never *require* a prompt; dangerous actions are confirmed with `y`/`yes` interactively or a flag otherwise.
  - [Node.js readline](https://nodejs.org/api/readline.html): `node:readline/promises` gives `await rl.question()`; the interface must be closed or the process won't exit.
- **Decision:** per-group prompt in a terminal, `--yes`/`--no-input` outside it, exit `2` when neither is given. No prompt library.

### 9. Reference code (consulted, not copied)

Projects in `../inspo/`, read only to see how others approached the same problems:

- `design-lint/src/core/apply-fixes.ts`: sorts fixes by start, drops overlapping ones, applies from the end so earlier offsets stay valid. Confirms the plan for `fix`; TokenTidy will also **report** skipped overlaps instead of dropping them silently.
- `design-lint/src/core/ignore.ts`: ignore patterns from the config plus ignore files. TokenTidy's ignore will require a rule id, so it can't hide more than intended.
- `design-lint/src/formatters/helpers/get-formatter.ts`: loads custom formatters with `import()` and warns that it runs arbitrary code. Reason TokenTidy has no formatter plugins.
- `design-token-extractor/packages/core/src/rewriter/migration.ts`: a typed list of skip reasons (`shorthand`, `calc`, `vendor-prefix`, `media-breakpoint`…). TokenTidy uses typed reasons too, but most of those cases get a solution instead of a skip.

---

## Plan 0.0.5 to 0.0.8 (2026-10-23)

Research behind [plan-0.0.5-0.0.8.md](plan-0.0.5-0.0.8.md). Rule followed: a Node built-in wins over a dependency when it does the same job.

### 10. Coverage floor

- **Difficulty:** keep test coverage from silently dropping as features grow.
- **Searched:** coverage thresholds in `node:test`; `c8` and `nyc`.
- **Sources:**
  - [Node.js: collecting code coverage](https://nodejs.org/en/learn/test-runner/collecting-code-coverage): `--experimental-test-coverage`, `--test-coverage-include`.
  - [Node.js v22.8.0 release notes](https://nodejs.org/en/blog/release/v22.8.0): `--test-coverage-lines`, `--test-coverage-branches`, `--test-coverage-functions`; the run exits 1 below the floor.
- **Decision:** built-in thresholds (lines 90, branches 85). No `c8`.

### 11. Glob matching for ignored paths

- **Difficulty:** `ignore: ["legacy/**"]` in the config needs a glob matcher.
- **Searched:** `path.matchesGlob` stability; `picomatch`, `minimatch`.
- **Sources:**
  - [Node.js path docs](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern): added in 22.5.0, **stable since v22.20.0**; same matcher as `fs.glob`, which the scanner already uses.
- **Decision:** `path.matchesGlob`; `engines` rises from `>=22.17.0` to `>=22.20.0`.

### 12. Atomic writes

- **Difficulty:** an interrupted `generate` must not leave half-written token files.
- **Sources:**
  - [write-file-atomic README](https://github.com/npm/write-file-atomic): temp file in the same folder, then `rename`; retries on Windows when the target is locked.
- **Decision:** the same algorithm in `fs-safe.ts` (temp + `rename`, retry on `EPERM`/`EBUSY`), no dependency.

### 13. Terminal-safe output

- **Difficulty:** values, paths and parser messages come from user files; a file can contain escape sequences that rewrite the terminal.
- **Sources:**
  - [Node.js util.stripVTControlCharacters](https://nodejs.org/api/util.html#utilstripvtcontrolcharactersstr).
  - [strip-ansi README](https://github.com/chalk/strip-ansi): recommends the built-in.
- **Decision:** text mode escapes every C0/C1 control character (`\u001b`) instead of stripping it, so nothing is hidden; JSON keeps the exact text (it is already escaped by `JSON.stringify`).

### 14. Ignore comments

- **Difficulty:** let a developer accept one value on purpose without hiding more than intended.
- **Sources:**
  - [stylelint: ignore code](https://stylelint.io/user-guide/ignore-code): `stylelint-disable-line`, `stylelint-disable-next-line`, rule lists, `-- reason`; `reportNeedlessDisables`.
  - [ESLint: disabling rules](https://eslint.org/docs/latest/use/configure/rules#disabling-rules): same shape, `--report-unused-disable-directives`.
- **Decision:** `tokentidy-ignore-line <rules> -- reason` and `tokentidy-ignore-next-line <rules> -- reason`; a directive without rule ids ignores nothing and is reported; unused directives are reported.

### 15. Minified files

- **Difficulty:** a minified bundle produced 9754 lines of output in the lab.
- **Sources:**
  - [GitHub Linguist, generated.rb](https://github.com/github-linguist/linguist/blob/main/lib/linguist/generated.rb): `minified_files?` = average line length above 110 characters.
- **Decision:** same rule, plus the `*.min.*` name; the files are listed, not silently dropped; `includeMinified: true` reads them.

### 16. Gray or color

- **Difficulty:** `#111827` (Tailwind's `gray-900`) was named `blue`: its OKLCH chroma is 0.032, above the 0.02 threshold.
- **Sources:**
  - [Tailwind CSS v4 theme.css](https://unpkg.com/tailwindcss@4.1.14/theme.css): 242 OKLCH colors. `gray-900` = `oklch(21% 0.034 264.665)`, `blue-50` = `oklch(97% 0.014 254.604)`: grays can have more chroma than light tints.
- **Decision:** the family comes from the nearest palette color (ΔEOK); `slate`, `gray`, `zinc`, `neutral`, `stone` collapse into `gray`.

### 17. Scale size references

- **Sources:**
  - [Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/): 13 steps.
  - [Material 3 typography (Compose)](https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography): 15 baseline styles (display, headline, title, body, label × large, medium, small). The roadmap said 13; corrected.
- **Decision:** the diagnosis compares with 13 spacing steps and 15 font sizes.

### 18. CI

- **Sources:** GitHub releases API for [actions/checkout](https://github.com/actions/checkout/releases) (v7.0.1) and [actions/setup-node](https://github.com/actions/setup-node/releases) (v7.1.0).
- **Decision:** `@v7` of both; matrix Linux, Windows, macOS × Node 22, 24.

### 19. Sizing properties

- **Question:** which numeric properties beyond the current ones are worth scanning. Positional and effect-specific values are out of scope.
- **Lab data** (`todo-list-original/*` and the v0.0.4 `lacunas` fixtures): `width` ×3, `min-width` ×3, `height` ×3, `max-width` ×4, `min-height` ×1, `text-indent` ×1, `outline-offset` ×1, `column-rule` ×1. Review items: `width` 1rem/2rem on an icon-like class, `min-height`/`min-width` 44px on a touch target.
- **Sources:**
  - [Primer size primitives](https://primer.style/product/primitives/size/): control sizes 24/28/32/40/48px, overlay widths 192/320/480/640/960px, focus outline width 2px and offset -2px.
  - [Tailwind width](https://tailwindcss.com/docs/width): `w-<n>` and `size-<n>` are `calc(var(--spacing) * n)` (sizing shares the spacing scale); named widths (`w-sm`) use `--container-*`.
  - [Carbon select](https://www.carbondesignsystem.com/components/select/style) and [content switcher](https://carbondesignsystem.com/components/content-switcher/style/): control heights 32/40/48px.
  - [@carbon/layout containers](https://tessl.io/registry/tessl/npm-carbon--layout/files/docs/containers.md): container02 to 04 = 2, 2.5, 3rem.
- **Findings:** design systems tokenize sizes of controls, icons, avatars and overlays, not arbitrary layout widths. A `width` is a token when its context says what it sizes.
- **Candidates:** `width`/`height` with a control, icon or avatar context (selector words, `button`/`input`/`img`/`svg`); `min-height`/`min-width` touch targets; `max-width` as container or overlay width; `scroll-margin`/`scroll-padding` and `border-spacing` as spacing. `text-indent`, `flex-basis` and `column-width` stay out: layout values with no scale in the systems above.
- **Decision:** pending.

---

## Earlier research (v0.0.2 to v0.0.4)

Recorded in [CLAUDE.md](CLAUDE.md#stack) and in [experience-log.md](experience-log.md): the value parser experiment (`postcss-value-parser` vs. `@csstools`), the choice of each host parser, the DTCG 2025.10 format, Tailwind v4 scales for names, OKLCH hue families, and dropping `fast-glob` because of the `braces` advisory.
