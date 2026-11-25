# Quick start

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/quick-start.md).

This page takes you from zero to a project using design tokens, in three steps. It assumes TokenTidy is [installed](installation.md) and that the terminal is in your project folder.

Not sure what a design token is? Read [Design tokens](design-tokens.md) first.

## 1. Find the hardcoded values

```bash
npx tokentidy check
```

You get one table per file, with each visual value written straight into the code:

```
src/Card.css
  Line   Type      Property   Value     Use instead
  2:10   color     color      #4f46e5   --color-primary
  3:8    spacing   gap        10px      —

✖ 2 hardcoded values in 1 file.
  1 of them already has a token: run tokentidy fix to replace it.
  1 item for review: tokentidy check --review
```

Each row has the line and column, the kind of value, the CSS property, the value and, when the project already has one, the token to use. The last lines say what to run next. Values the code alone can't judge, such as a `width`, are items for review: `check --review` shows them, and they never fail the command.

In a pipe or in CI, the same values come as tab-separated lines (`file:line:column`, kind, rule, property, value), which VS Code turns into links.

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

It creates the `design-tokens/` folder with `tokens.css`. Only values used at least 3 times become tokens. You can edit names and values in `tokens.css`: the next `generate` keeps them. For other formats, add `--dtcg`, `--scss`, `--less`, `--ts` or `--js`. More in [The generate command](generate.md).

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
