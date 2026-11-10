# Exit codes

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/exit-codes.md).

When a command ends, it returns a number, the **exit code**. You don't see it on screen, but CI services, pre-commit hooks and scripts use it to know whether the step passed.

| Code | Meaning |
|---|---|
| `0` | All good: no violations (`check`; review items and warnings don't count), tokens generated (`generate`), nothing left to fix (`fix`), no problem in the token files (`validate`) |
| `1` | Hardcoded values were found (`check`) or remain after `fix`, two micro-frontends define the same global token with different values (`check`), a token file has a problem (`validate`), or a file has a syntax error |
| `2` | Usage or execution error: missing path or `--tokens` folder, unknown option, invalid config, output folder outside the project, corrupted token file, existing token files without `--extend`/`--new` outside a terminal, `fix --approximate` outside a terminal without `--yes`/`--no-input`, `generate --shared` with fewer than two apps, a broken `tokentidy.decisions.json` |

## Seeing the code

Run the command, then:

| Terminal | Command |
|---|---|
| macOS / Linux | `echo $?` |
| Windows PowerShell | `echo $LASTEXITCODE` |

```bash
npx tokentidy check ./src; echo $?
```

## Why it matters

Because `check` ends with `1` when a hardcoded value shows up, a CI job or a pre-commit hook running it fails at that moment. See [Scripts and CI](ci-and-scripts.md).
