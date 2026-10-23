# JSON output

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/json-output.md).

With `--json`, each command prints its result as one JSON object, for another program to read (a script, a CI step, another tool). While TokenTidy is in version `0.x`, the format may change.

## `check --json`

```json
{
  "root": "/home/you/todo-list-react",
  "filesAnalyzed": 7,
  "findings": [
    {
      "file": "src/App.jsx",
      "line": 29,
      "column": 28,
      "offset": 795,
      "endOffset": 802,
      "type": "color",
      "rule": "color/hardcoded",
      "property": "color",
      "value": "#4f46e5",
      "host": "jsx",
      "selector": "h1"
    }
  ],
  "review": [{ "file": "src/App.jsx", "line": 31, "column": 12, "type": "size", "rule": "size/no-context", "property": "width", "value": "120", "message": "size without context: …" }],
  "ignored": 0,
  "errors": [],
  "warnings": [],
  "skipped": [{ "file": "src/App.vue", "reason": "unsupported" }],
  "unmatched": [],
  "definitions": [{ "name": "$roxo", "syntax": "scss-variable", "value": "#4f46e5", "file": "src/App.scss", "line": 2, "column": 1 }],
  "references": [{ "name": "$roxo", "property": "accent-color", "file": "src/App.scss", "line": 16, "selector": ".tarefa input[type=\"checkbox\"]" }],
  "styleLanguages": ["css", "scss"],
  "tokenFiles": []
}
```

| Field | Meaning |
|---|---|
| `root` | The project root |
| `findings` | The violations. `file` is relative to `root` and always uses `/`, also on Windows |
| `offset`, `endOffset` | The exact slice of the value in the file (starting at 0, end not included) |
| `host` | Where the value was written: `css`, `scss`, `sass`, `less`, `html`, `jsx`, `angular-template` |
| `selector` | The CSS selector, or `tag.class` for inline styles |
| `atRules`, `function`, `impliedUnit` | Optional: the at-rules around the rule (`@media (...)`), the function around the value (`darken`), the unit implied by the code (`px` for `padding: 8` in JSX, `rem` for `[style.gap.rem]`) |
| `review` | Review items: the same fields as a finding, plus `message` |
| `ignored` | How many values ignore comments removed |
| `errors` | Files with syntax errors (`file`, `line`, `column`, `message`) |
| `warnings` | Ignore comment problems (`file`, `line`, `column`, `rule`, `message`) |
| `skipped` | Files not analyzed (`file`, `reason`: `minified`, `unsupported`, `ignored`) |
| `unmatched` | Paths with nothing to analyze |
| `definitions`, `references` | The tokens the project already defines, and where it uses them |
| `tokenFiles` | Files dedicated to tokens |
| `rootFontSize` | Present when the project sets `html { font-size }` |

## `generate --json`

| Field | Meaning |
|---|---|
| `root`, `filesAnalyzed` | As in `check` |
| `mode` | `extend` or `new` |
| `config` | The settings in effect |
| `dryRun` | Whether files were written |
| `files` | Paths written, or that would be written |
| `tokens` | Each with `path`, `name`, `type`, `key`, `value`, `count`, `spellings`, `occurrences`, and `equivalents`/`kept` when they apply |
| `aliases` | Semantic aliases |
| `reused` | Values that already had a token in the project |
| `belowThreshold` | Values used fewer times than the threshold, with their occurrences |
| `suggestions` | `kind`, `type`, `message`, `values` |
| `diagnosis` | `type`, `distinct`, `steps`, `uses`, `onStep`, `consistency` (0–1), `singleUse`, `reference` |
| `rootFontSize`, `errors`, `warnings`, `skipped` | As in `check` |

## `fix --json`

| Field | Meaning |
|---|---|
| `root`, `dryRun` | As above |
| `files` | Each changed file, with its `replacements` (`line`, `column`, `type`, `property`, `value`, `token`, `source`, `text`) and, with `--dry-run`, its `diff` |
| `skippedValues` | Values not replaced, with the reason ([fix](fix.md#values-it-skips)) |
| `withoutToken` | Values with no token of the same value |
| `remaining` | Violations left after the fix |
| `errors`, `warnings`, `skipped` | As in `check` |

## Example: read it with `jq`

```bash
npx tokentidy check --json | jq '.findings | length'           # how many violations
npx tokentidy check --json | jq -r '.findings[].value' | sort -u  # every distinct value
```
