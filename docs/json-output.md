# JSON output

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/json-output.md).

With `--json`, each command prints its result as one JSON object, for another program to read (a script, a CI step, another tool). While TokenTidy is in version `0.x`, the format may change.

Every `--json` output starts with `schemaVersion` (currently `1`). It goes up when a field changes or is removed; a new field doesn't change it.

## `check --json`

```json
{
  "schemaVersion": 1,
  "root": "/home/you/todo-list-react",
  "filesAnalyzed": 7,
  "partial": false,
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
      "selector": "h1",
      "suggestion": { "token": "--color-primary", "match": "exact" }
    }
  ],
  "review": [{ "file": "src/App.jsx", "line": 31, "column": 12, "type": "size", "rule": "size/no-context", "property": "width", "value": "120", "message": "size without context: …" }],
  "ignored": 0,
  "errors": [],
  "warnings": [],
  "skipped": [{ "file": "src/App.vue", "reason": "unsupported" }],
  "unmatched": [],
  "definitions": [{ "name": "$roxo", "syntax": "scss-variable", "value": "#4f46e5", "file": "src/App.scss", "line": 2, "column": 1 }],
  "references": [{ "name": "$roxo", "property": "accent-color", "file": "src/App.scss", "line": 16, "column": 17, "selector": ".tarefa input[type=\"checkbox\"]" }],
  "styleLanguages": ["css", "scss"],
  "tokenFiles": [],
  "repeatedWithoutToken": [],
  "unusedTokens": []
}
```

| Field | Meaning |
|---|---|
| `root` | The project root |
| `partial` | `true` when only part of the project was requested: definitions and uses still cover the whole project |
| `findings` | The violations. `file` is relative to `root` and always uses `/`, also on Windows |
| `suggestion` | Optional, on a finding: `token`, `match` (`exact` or `near`), `distance` on `near` (px difference, or ΔEOK for colors), `alternatives` on a tie ([check](check.md#which-token-fits)) |
| `offset`, `endOffset` | The exact slice of the value in the file (starting at 0, end not included) |
| `host` | Where the value was written: `css`, `scss`, `sass`, `less`, `html`, `jsx`, `angular-template`, `css-in-js`, `js-value`, `svg-attribute` |
| `selector` | The CSS selector, or `tag.class` for inline styles |
| `atRules`, `function`, `impliedUnit` | Optional: the at-rules around the rule (`@media (...)`), the function around the value (`darken`), the unit implied by the code (`px` for `padding: 8` in JSX, `rem` for `[style.gap.rem]`) |
| `review` | Review items: the same fields as a finding, plus `message` |
| `ignored` | How many values ignore comments removed |
| `errors` | Files with syntax errors (`file`, `line`, `column`, `message`) |
| `warnings` | Ignore comment problems and [token warnings](check.md#warnings-about-tokens) (`file`, `line`, `column`, `rule`, `message`) |
| `skipped` | Files not analyzed (`file`, `reason`: `minified`, `unsupported`, `ignored`) |
| `unmatched` | Paths with nothing to analyze |
| `definitions`, `references` | The tokens the project already defines, and where it uses them. A reference has the `fallback` of `var(--x, 12px)` when there is one; a definition has `deprecated` when the DTCG file says so |
| `tokenFiles` | Files dedicated to tokens |
| `rootFontSize` | Present when the project sets `html { font-size }` |
| `repeatedWithoutToken` | Values `generate` would turn into tokens and that have none: the tokens folder is out of date. Empty without tokens |
| `unusedTokens` | Custom properties nobody uses (`name`, `file`, `line`). Empty on a partial run |
| `baselined` | With `--baseline`: how many violations the baseline covered |
| `summary` | With `--summary`: one item per token type (`type`, `hardcoded`, `tokenized`) |
| `microFrontends` | With two or more apps ([Micro-frontends](micro-frontends.md)): `projects` (`name`, `dir`) and `issues` (`rule`, `severity`, `file`, `line`, `column`, `property`, `value`, `detail`) |

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
| `consolidated` | The [consolidation](generate.md#close-values-consolidation) groups: `id`, `type`, `label`, `to`, `from` (`key`, `count`), `applied` (how many uses were merged), `blocked` (`file`, `line`, `value`, `guard`, `reason`), `kept` (relationships that still hold) |
| `themes` | Semantic tokens with a value per mode ([Themes](themes.md)): `path`, `light`, `dark` |
| `rootFontSize`, `errors`, `warnings`, `skipped` | As in `check` |

## `fix --json`

| Field | Meaning |
|---|---|
| `root`, `dryRun` | As above |
| `files` | Each changed file, with its `replacements` (`line`, `column`, `type`, `property`, `value`, `token`, `source`, `text`, `reason`, and `definedAt`/`alternatives` when they apply) and, with `--dry-run`, its `diff` |
| `skippedValues` | Values not replaced, with the reason ([fix](fix.md#values-it-skips)); `alternatives` lists the tokens in a tie |
| `withoutToken` | Values with no token of the same value |
| `repeatedWithoutToken` | The part of those that `generate` would turn into tokens: the tokens folder is out of date |
| `approximate` | With `--approximate`: each group with `id`, `type`, `label`, `to`, `token`, `status` (`applied`, `rejected`, `pending`, `blocked`), `from`, `changes`, `blocked`, `kept` |
| `remaining` | Violations left after the fix |
| `errors`, `warnings`, `skipped` | As in `check` |

## `generate --shared --json`

A different shape, one entry per folder written ([Micro-frontends](micro-frontends.md#a-shared-token-package-generate---shared)):

| Field | Meaning |
|---|---|
| `root`, `mode`, `dryRun` | As in `generate` |
| `targets` | `name` (`shared` or the app), `dir`, `tokens`, `files` |
| `errors`, `warnings`, `skipped` | As in `check` |

## `validate --json`

```json
{
  "schemaVersion": 1,
  "root": "/home/you/app",
  "files": ["design-tokens/brand.tokens.json"],
  "problems": [
    { "file": "design-tokens/brand.tokens.json", "path": "/color/link/$value", "rule": "reference/broken", "message": "{color.primery} does not exist" }
  ]
}
```

| Field | Meaning |
|---|---|
| `files` | Files checked, relative to `root`: those found and those a resolver points to |
| `problems` | `file`, `path` (a JSON pointer inside the file), `rule` ([validate](validate.md#what-it-checks)), `message` |

## Example: read it with `jq`

```bash
npx tokentidy check --json | jq '.findings | length'           # how many violations
npx tokentidy check --json | jq -r '.findings[].value' | sort -u  # every distinct value
```
