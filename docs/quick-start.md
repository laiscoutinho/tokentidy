# Quick start

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/quick-start.md).

This page takes you from zero to a project using design tokens, in three steps. It assumes TokenTidy is [installed](installation.md) and that the terminal is in your project folder.

Not sure what a design token is? Read [Design tokens](design-tokens.md) first.

## 1. Find the hardcoded values

```bash
npx tokentidy check
```

Each line is a visual value written straight into the code:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
src/App.jsx:31:12	review	size/no-context	width	120
```

Read it as: *file:line:column*, kind of item, rule, CSS property and value. In VS Code, <kbd>Ctrl</kbd> + click (<kbd>Cmd</kbd> + click on macOS) on the position opens the file at that spot. A summary is printed at the end:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

- **violation**: a value that should be a token;
- **review**: a value the code alone can't judge (it never fails the command).

More in [The check command](check.md) and [Rules](rules.md).

## 2. Create tokens from the repeated values

If the project has no tokens yet, let TokenTidy propose them. First look without writing anything:

```bash
npx tokentidy generate --dry-run
```

Then write the files:

```bash
npx tokentidy generate
```

It creates the `design-tokens/` folder with `tokens.tokens.json` and `tokens.css` (plus `_tokens.scss` or `_tokens.less` if the project uses them). Only values used at least twice become tokens. More in [The generate command](generate.md).

> Load `design-tokens/tokens.css` in your app (for example, import it in your main stylesheet), so the `var(--...)` tokens work.

## 3. Replace the values with the tokens

See what would change, as a diff, without touching any file:

```bash
npx tokentidy fix --dry-run
```

If it looks right, apply it:

```bash
npx tokentidy fix
```

`fix` only uses tokens with **exactly the same value**, and only edits the slice of each file that holds the value. More in [The fix command](fix.md).

## And then?

Run `npx tokentidy check` again: what is left are the values that need a decision from you. To keep the project clean over time, run `check` in CI or before each commit: see [Scripts and CI](ci-and-scripts.md).

All the commands are listed in [Commands](commands.md).
