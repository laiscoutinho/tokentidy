# Configuration

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/configuration.md).

TokenTidy works without any configuration. To change its defaults, create a file named `tokentidy.config.json` at the root of your project (next to `package.json`). Every key is optional.

```json
{
  "minOccurrences": 2,
  "gridBase": 4,
  "rootFontSize": 16,
  "output": "design-tokens",
  "splitThreshold": 60,
  "semanticTokens": true,
  "ignore": ["legacy/**", "**/*.generated.css"],
  "includeMinified": false,
  "colorTolerance": 0.02
}
```

## Keys

| Key | Default | What it does |
|---|---|---|
| `minOccurrences` | `2` | Uses needed for a value to become a token (integer, at least 2) |
| `gridBase` | `4` | Spacing grid in px: names the scale and decides what is off the grid |
| `rootFontSize` | detected from `html { font-size }`, or `16` | px per `rem`, to compare `rem` with `px` |
| `output` | `design-tokens` | Folder for the generated tokens, relative to the project |
| `splitThreshold` | `60` | From how many tokens the CSS is split into one file per category |
| `semanticTokens` | `true` | Generate semantic aliases (`color-text-danger`) |
| `ignore` | `[]` | Patterns of files and folders to skip, relative to the project root (`legacy/**`). They are listed as skipped, with the reason `ignored`. A pattern starting with `!` brings files back ([below](#ignore-patterns)) |
| `componentProps` | `gap`, `rowGap`, `columnGap`, `padding*`, `margin*` (with `X`/`Y`), `color`, `backgroundColor`, `borderColor`, `borderRadius`, `fontSize`, `lineHeight` | Component props read as style values (`<Stack gap="12px">`), as a list of prop names. The list replaces the default; `[]` turns it off. Only text with a unit or a color is read ([check](check.md#where-it-looks)) |
| `includeMinified` | `false` | Analyze minified files instead of listing them as skipped |
| `colorTolerance` | `0.02` | How close two colors must be (ΔE in OKLab, `0` or more) to count as the same decision: used by [consolidation](generate.md#close-values-consolidation) and by [`fix --approximate`](fix.md#values-close-to-a-token---approximate) |

## Ignore patterns

Patterns are read in order and the **last one that matches wins**, as in `.gitignore`. A `!` in front brings back what an earlier pattern, or the default exclusion of tests and stories ([check](check.md#what-it-skips)), left out:

```json
{ "ignore": ["legacy/**", "!legacy/theme.css", "!src/**/*.stories.tsx"] }
```

Here `legacy/` is skipped except `legacy/theme.css`, and stories in `src/` are analyzed.

## Which value wins

A command-line option wins over the config file, which wins over the default. For example, `--min-occurrences 3` wins over `"minOccurrences": 2`.

## Another file

To use a config file with another name or in another place:

```bash
npx tokentidy check --config configs/tokentidy.json
```

## Mistakes are reported

An unknown key, a value of the wrong type or invalid JSON stops the command with exit code `2` and a message naming the key. Nothing is silently ignored.
