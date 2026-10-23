# Implementation plan: 0.0.9 (`fix`)

Written on 2026-10-23, before any code change. It turns roadmap 0.0.9 into concrete work. Sources behind each choice are in [research-log.md](research-log.md#2026-10-23-fix-009).

## 1. Scope

**In:** `tokentidy fix [paths...]` replaces a hardcoded value by a token **only when the token has exactly the same value** (same type and same normalized key that `generate` uses). It works in every host `check` already reads: CSS, SCSS, Sass, Less, HTML `style=""` and `<style>`, JSX `style={{}}`, Angular templates (`style=""`, `[style.x]`, `[style]`, `[ngStyle]`) and inline Angular `styles`.

**Out (later versions):**

- creating tokens (that is `generate`);
- values that are only close to a token (`15px` → the `16px` token): 0.0.19, after the coherence guards;
- tokens from npm packages or JS themes (token index, 0.0.17);
- React Native and canvas (`tokens.ts`, 0.0.20);
- values that `check` doesn't report yet (mixin arguments, CSS-in-JS).

## 2. Research-backed choices

No new runtime dependency.

| Need | Choice | Discarded | Why |
|---|---|---|---|
| Exit code | ESLint `--fix` model: 0 nothing remains, 1 violations or syntax errors remain, 2 usage error | exit 1 when something changed | CI and hooks need "is the code clean now?", not "did the tool do something?" |
| Preview | `--dry-run` prints a unified diff (git style) on stdout | printing whole files | Readable, and `git apply` can apply it |
| Diff generator | own, built from the known edits (~100 lines) | `diff`, `jsdiff` | The changed ranges are known exactly; a general diff algorithm is not needed |
| Writing | `writeFileAtomic` (temp file + rename) that keeps the file mode | `write-file-atomic` | Same behavior as the package, already in the code base |
| `var()` in Sass/Less | only outside functions or inside CSS-native functions, never next to arithmetic or in media queries | always `var()` | Dart Sass experiment: `darken(var(--x))` and `var(--x) * 2` fail the build; `rgba(var(--x), .5)` and `var(--x) + 8px` compile to wrong CSS |
| Angular `[style.width.px]="16"` | remove the `.px` suffix and write `'var(--x)'` | skipping | `var(--x)px` is invalid; the compiler gives the suffix position |

## 3. Which token replaces a value

### 3.1 Token sources

1. **Generated semantic aliases** (`color.text.danger`) in the tokens folder, for the occurrence they were created for (same file, selector and property, and the alias target has the value).
2. **Hand-written custom properties** of the project, global only: every selector of the definition is `:root`, `html` or `body`, and every definition of that name has the same value. A name redefined with another value under `[data-theme=dark]` or a media query is a theme variable; replacing a fixed value by it would change the other theme.
3. **Hand-written SCSS/Less variables** visible in the file: top level (outside any rule), defined earlier in the same file, or in a file it imports globally (`@import`, `@use … as *`).
4. **Generated tokens** in the tokens folder (`design-tokens/` or `output` in the config), when the matching output file exists (`tokens.css` for `var()`, `_tokens.scss` for `$x`, `_tokens.less` for `@x`).

Between two hand-written tokens with the same value, the most used one wins, then the first defined. `generate` uses the same rule for "already has a token" (the shared code moves to `src/token-index.ts`).

### 3.2 How the token is written

| Host and context | Written as |
|---|---|
| CSS, HTML, Angular template, plain property value | `var(--name)` |
| SCSS/Sass/Less outside functions, or inside `calc`, `clamp`, `min`, `max`, gradients, `color-mix`, `light-dark` | `var(--name)`, or the visible `$x`/`@x` |
| SCSS/Sass/Less inside another function (`darken`, `rgba`, `math.div`, a project function), next to `+ - * / %`, or in `@media`/`@container` | `$name` / `@name`; the generated one comes with `@use '<path>/tokens' as *;` or `@import (reference) '<path>/_tokens.less';` |
| Inline Angular `styles` in a `.ts` file, same context | skipped (`$x` can't be imported there) |
| JSX number (`padding: 8`) | `'var(--name)'`, with the quote style the file uses most |
| JSX string (`'8px 16px'`) | `var(--name)` inside the string |
| Angular `[style.width.px]="16"` / `{'width.px': 16}` | `[style.width]="'var(--name)'"` / `{'width': 'var(--name)'}` |
| Angular unit binding with a ternary (`a ? 16 : 24`) | skipped (the suffix is shared by both values) |

## 4. Modules

```
src/
├── token-index.ts      # reusable hand-written definitions + where each syntax works (moved from generate.ts)
├── fix/
│   ├── candidates.ts   # every token that can replace a (type, key), from the project and the tokens folder
│   ├── plan.ts         # pure: finding → edit or skip reason; imports to add
│   ├── apply.ts        # reads, re-analyzes in memory, writes; the safety checks
│   └── diff.ts         # unified diff from known edits
└── cli/fix.ts          # `fix` command
```

Changes elsewhere:

- `Finding.unitSuffix` (`{ offset, endOffset }`), set by the Angular parser;
- `analyzeScope(scope, { sources })`: contents in memory instead of the disk, to re-analyze the fixed files before writing;
- `writeFileAtomic` keeps the mode of the file it replaces;
- `output.ts` exports `treeTokensOf(tree)` (tokens, aliases and their occurrences).

## 5. Security

| Risk | Measure |
|---|---|
| Writing outside the project | each file is checked with `assertInsideRoot` (realpath) before writing |
| Following a symlink to another place | files that are symlinks are skipped |
| A file changed between analysis and writing (editor, formatter) | the offsets are checked against the content read (`slice === value`) and the file is read again right before writing; any difference skips the file |
| A fix that breaks the syntax | the fixed contents are analyzed again in memory; a file with more syntax errors than before is not written |
| Overlapping edits | the second one is skipped (it can't happen with the current parsers, but a future one could) |
| Half-written file | atomic write; the mode is kept |
| Terminal injection through file content | everything printed goes through `printable()`; the diff escapes control characters in the lines it prints |
| Tokens folder outside the project | same check as `generate` (`assertInsideRoot`) |

Line endings and BOM stay as they are: edits are applied by offset on the original text, from the end to the start.

## 6. Completeness

- Every finding ends up in one of three places: replaced, skipped with a reason, or without a token (counted in the summary).
- Skip reasons: `needs-preprocessor-variable`, `inline-style-function`, `variable-not-loaded` (added during implementation: a variable with the value exists but isn't loaded, or the tokens file is loaded with a namespace), `unit-in-binding`, `overlap`, `breaks-syntax`, `changed-on-disk`, `symlink`, `outside-root` (a file under a symlinked folder).
- Files inside the tokens folder are never edited.
- Review items are never replaced: they are not violations.
- Ignored values (`tokentidy-ignore-line`) are never replaced: `check` already removed them.

## 7. Work items

1. `src/token-index.ts`; `generate.ts` imports from it (no behavior change).
2. `Finding.unitSuffix` in the Angular parser.
3. `sources` option in `analyzeScope`; mode kept in `writeFileAtomic`.
4. `treeTokensOf` in `output.ts`.
5. `fix/candidates.ts`, `fix/plan.ts`, `fix/diff.ts`, `fix/apply.ts`.
6. `cli/fix.ts`, help examples, public API in `index.ts`.
7. Tests: one per host and context in §3.2, theme override, imports, symlink, changed file, overlap, broken syntax, dry-run diff, idempotent second run, CLI exit codes.
8. Docs: README, `commands.md`, `CLAUDE.md`, `experience-log.md`.
9. Lab v0.0.9: `check`, `generate` and `fix --dry-run`, then `fix` on copies of the lab apps, which must still build.

## 8. Done when

- after `fix`, every file parses and a second `fix --dry-run` prints nothing;
- the lab apps still build after `fix`;
- `npm run check` passes (types, tests, coverage floor) and `npm audit` reports 0.
