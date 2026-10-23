# The `fix` command

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/fix.md).

`fix` replaces each hardcoded value with a token of **exactly the same value**. Values without such a token are left alone and counted. Values that are only *close* to a token (`15px` and a `16px` token) are never touched.

```bash
npx tokentidy fix --dry-run                     # show a diff, write nothing
npx tokentidy fix                               # write the files, print the changed paths
npx tokentidy fix src/components --tokens tokens/
```

Always start with `--dry-run`: it prints a unified diff (the same format as `git diff`, which `git apply` accepts), so you see every change before it happens.

If the project has no tokens at all, `fix` says to run [`generate`](generate.md) first.

## Which token is used

In this order:

1. a generated **semantic alias** (`--color-text-danger`), only where it was created for;
2. a **hand-written token** of the project: a global custom property (`:root`/`html`/`body`, never redefined with another value by a theme or media query), or a top-level `$x`/`@x` visible in the file (same file, or a file it loads with `@import`/`@use … as *`). Between two, the most used wins;
3. a **generated token** from the tokens folder (`design-tokens/`, or `output` in the config), when its file exists: `tokens.css` for `var()`, `_tokens.scss` for `$x`, `_tokens.less` for `@x`.

## How the token is written

| Where | Written as |
|---|---|
| CSS, HTML `style=""`, Angular `style=""`, plain SCSS/Less values, `calc()`, gradients, `color-mix()` | `var(--name)` |
| SCSS/Sass/Less inside another function (`darken`, `math.div`), next to `* / + % -`, or in `@media` | `$name` / `@name`. A generated one comes with `@use '<path>/tokens' as *;` (Sass: no `;`) or `@import (reference) '<path>/_tokens.less';` |
| JSX number (`padding: 16`) | `'var(--name)'`, in the quote style the file uses most |
| JSX string (`'8px 16px'`) | `'8px var(--name)'` |
| Angular `[style.padding.px]="16"` / `{'gap.px': 16}` | `[style.padding]="'var(--name)'"` / `{'gap': 'var(--name)'}` |

## Values it skips

Skipped values are listed on the error output, with the reason:

```
src/App.scss:12:10	skipped	needs-preprocessor-variable	16px	…
```

| Reason | When |
|---|---|
| `needs-preprocessor-variable` | Sass/Less need the value at build time and no `$x`/`@x` with it is available |
| `inline-style-function` | The same, in an Angular inline `styles:` (it can't import Sass variables) |
| `variable-not-loaded` | The tokens file is loaded with a namespace (`@use … as t`), or a variable with the value exists but isn't imported |
| `unit-in-binding` | `[style.width.px]="a ? 16 : 24"`: the unit in the name belongs to both values |
| `overlap` | Two replacements on the same text |
| `breaks-syntax` | The fixed file would have a syntax error (it is analyzed again in memory before writing) |
| `changed-on-disk` | The file changed while the command was running |
| `symlink`, `outside-root` | The file is a symbolic link or resolves outside the project |

## Safety

- Files inside the tokens folder are never edited.
- Every file is read again right before writing, and written atomically, keeping its permissions.
- Edits are made by position: line endings, BOM and the rest of the file stay as they were.

## Summary

On the error output:

```
12 values replaced in 4 files; 1 skipped; 9 without a token; 10 violations remain
```

When generated tokens were written as `var()`, it also reminds you that the app must load `design-tokens/tokens.css`.

## Options

| Option | What it does |
|---|---|
| `--tokens <dir>` | Folder with the generated tokens (default: `output` in the config, `design-tokens`) |
| `--config <file>` | Config file (default: `tokentidy.config.json` in the project) |
| `--dry-run` | Prints a unified diff instead of writing |
| `--json` | Prints the result as JSON ([JSON output](json-output.md)) |

## Exit code

Like `eslint --fix`: `0` when no violations or syntax errors remain, `1` when some remain (also with `--dry-run`, counted as if the fix were applied), `2` for usage errors. See [Exit codes](exit-codes.md).
