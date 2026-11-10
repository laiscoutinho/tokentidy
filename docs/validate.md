# The `validate` command

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/validate.md).

`validate` checks design token files in the [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) format before another tool reads them. It changes nothing.

```bash
npx tokentidy validate                                   # every token file in the project
npx tokentidy validate design-tokens/tokens.tokens.json  # one file
npx tokentidy validate --json
```

## Which files

Inside the folders you give (default: the current folder), every `*.tokens.json` and `*.resolver.json`, except what the config's `ignore` skips. A file named explicitly is checked whatever its name. Files a resolver points to (`"$ref": "tokens.tokens.json"`) are checked too.

## What it checks

| Rule | Problem |
|---|---|
| `json/invalid` | The file isn't valid JSON |
| `json/too-deep` | Nested more than 64 levels |
| `schema/invalid` | Doesn't follow the DTCG 2025.10 schema (a `$value` of the wrong shape, an unknown `$type`, a name starting with `$`…) |
| `reference/broken` | An alias (`{color.primery}`), a `$extends` or a resolver `$ref` points to something that doesn't exist |
| `reference/cycle` | Aliases or `$extends` that go around in a circle (`color.a → color.b → color.a`) |
| `reference/too-deep` | A `$extends` chain longer than 64 |
| `reference/type-mismatch` | An alias points to a token of another type (a `dimension` whose value is a `color`) |
| `token/no-type` | A token without `$type`, not even from its group or from the token it points to |
| `resolver/unknown-default` | A resolver modifier whose `default` isn't one of its contexts |
| `resolver/missing-source`, `resolver/outside-root` | A resolver points to a file that doesn't exist, or that is outside the project |

When a file doesn't follow the schema, the reference rules are skipped for it: they would only repeat the same error.

## What it prints

One line per problem, with the file, the rule, the place in the file as a [JSON pointer](https://www.rfc-editor.org/rfc/rfc6901) and the message:

```
design-tokens/brand.tokens.json	error	reference/cycle	/color/b/$value	alias cycle: color.a → color.b → color.a
design-tokens/brand.tokens.json	error	reference/broken	/color/link/$value	{color.primery} does not exist
design-tokens/brand.tokens.json	error	reference/type-mismatch	/space/m/$value	expected dimension, but {color.primary} is color
1 file checked; 3 problems
```

The last line goes to the error output. Without token files, it says `No token files found (*.tokens.json, *.resolver.json)` and ends with `0`.

## Options

| Option | What it does |
|---|---|
| `--json` | Prints `{ schemaVersion, root, files, problems }` ([JSON output](json-output.md#validate---json)) |
| `--config <file>` | Config file (default: `tokentidy.config.json` in the project) |

## Exit code

`0` when no problem was found, `1` when there is at least one, `2` for a usage error (a path that doesn't exist). See [Exit codes](exit-codes.md).

The files `generate` writes always pass `validate`, themes included.
