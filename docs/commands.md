# Commands

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/commands.md).

Every TokenTidy command, with a link to its own page. In a project where TokenTidy is installed, put `npx` before each command (`npx tokentidy check`).

## Available now

| Command | What it does | Page |
|---|---|---|
| `tokentidy check [paths...]` | Lists the hardcoded visual values | [check](check.md) |
| `tokentidy generate [paths...]` | Turns repeated values into design tokens | [generate](generate.md) |
| `tokentidy fix [paths...]` | Replaces values with tokens of exactly the same value | [fix](fix.md) |
| `tokentidy --help` | Shows the commands, options and examples | below |
| `tokentidy --version` | Shows the installed version | below |

`[paths...]` are files or folders to analyze. Without them, the current folder is used.

To see them running, step by step, go to [Examples](examples.md).

## How they work together

```
check     lists the values              changes nothing
   ↓
generate  creates the tokens            writes only to design-tokens/
   ↓
fix       replaces values with tokens   changes your code
```

All three start the same way: they find the project root, read the config, list the files and analyze them. So the result of `check` and the values that `generate` and `fix` see are the same.

| Command | Reads | Writes | Ends with `1` when |
|---|---|---|---|
| `check` | The code and the existing tokens | Nothing | There are violations or syntax errors |
| `generate` | The code and the existing tokens | The tokens folder (nothing with `--dry-run`, or if no value qualifies) | A file has a syntax error |
| `fix` | The code, the existing tokens and the tokens folder | The code (nothing with `--dry-run`) | Violations or syntax errors remain |

Any of them ends with `2` for a usage error, such as an unknown option or a path that doesn't exist ([Exit codes](exit-codes.md)).

### Help

`tokentidy` with no arguments, or `tokentidy --help`, shows the TokenTidy banner, the list of commands, the options and usage examples. It also works for one command:

```bash
npx tokentidy --help
npx tokentidy check --help
npx tokentidy generate --help
npx tokentidy fix --help
```

### Version

`tokentidy --version` (or `-V`) prints the installed version, such as `0.0.9`.

## Every option

| Option | Commands | What it does |
|---|---|---|
| `--json` | all three | Prints the result as JSON, for scripts ([JSON output](json-output.md)) |
| `--config <file>` | all three | Uses another config file ([Configuration](configuration.md)) |
| `--dry-run` | `generate`, `fix` | Shows what would be written, and writes nothing |
| `--min-occurrences <n>` | `generate` | Uses needed for a value to become a token (minimum 2) |
| `--out <dir>` | `generate` | Output folder, inside the project (default: `design-tokens`) |
| `--extend` | `generate` | Keeps the names generated before and adds the new ones |
| `--new` | `generate` | Forgets the previous output and names everything again |
| `--tokens <dir>` | `fix` | Folder with the generated tokens (default: `output` in the config, `design-tokens`) |

## Coming next

TokenTidy is in version `0.0.x`: each new feature is a patch release, and `0.1.0` will be the first with every planned feature. Names may still change.

| Feature | What it will do |
|---|---|
| `fix --approximate` | Also replaces values that are only close to a token (`15px` → the `16px` token), asking first |
| Several apps at once | Micro-frontends: drift between apps, `:root` collisions, a shared token package |
| `tokentidy validate <file>` | Checks a DTCG file: schema, broken aliases and cycles |
| Themes | Light/dark semantic tokens |
