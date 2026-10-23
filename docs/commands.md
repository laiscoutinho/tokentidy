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

## Options shared by the commands

| Option | Commands | What it does |
|---|---|---|
| `--json` | all three | Prints the result as JSON, for scripts ([JSON output](json-output.md)) |
| `--config <file>` | all three | Uses another config file ([Configuration](configuration.md)) |
| `--dry-run` | `generate`, `fix` | Shows what would be written, and writes nothing |

## Coming next

TokenTidy is in version `0.0.x`: each new feature is a patch release, and `0.1.0` will be the first with every planned feature. Names may still change.

| Feature | What it will do |
|---|---|
| Sizing properties | `width`/`height` of controls, icons and avatars as `size`, containers, `min-height` |
| Token freshness | Values without a token split into *used once* and *repeated without a token* (the tokens folder is out of date) |
| SCSS/Less expressions | Mixin arguments and defaults, `mat.*-overrides` maps |
| JS/TS style objects, CSS-in-JS | Style objects outside `style={{}}`; styled-components, Emotion, `sx` |
| React Native, more Angular | `StyleSheet.create`; `host`, `@HostBinding`, `Renderer2.setStyle` |
| Token lookup in `check` | Says whether a token already exists for a value, and catches references to tokens that don't exist |
| `fix --approximate` | Also replaces values that are only close to a token (`15px` → the `16px` token), asking first |
| Several apps at once | Micro-frontends: drift between apps, `:root` collisions, a shared token package |
| `tokentidy validate <file>` | Checks a DTCG file: schema, broken aliases and cycles |
| `--summary`, `--format github` | Totals per rule; GitHub annotations for CI |
| Themes | Light/dark semantic tokens |
