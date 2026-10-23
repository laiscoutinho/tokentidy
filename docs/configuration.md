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
  "includeMinified": false
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
| `ignore` | `[]` | Patterns of files and folders to skip, relative to the project root (`legacy/**`). They are listed as skipped, with the reason `ignored` |
| `includeMinified` | `false` | Analyze minified files instead of listing them as skipped |

## Which value wins

A command-line option wins over the config file, which wins over the default. For example, `--min-occurrences 3` wins over `"minOccurrences": 2`.

## Another file

To use a config file with another name or in another place:

```bash
npx tokentidy check --config configs/tokentidy.json
```

## Mistakes are reported

An unknown key, a value of the wrong type or invalid JSON stops the command with exit code `2` and a message naming the key. Nothing is silently ignored.
