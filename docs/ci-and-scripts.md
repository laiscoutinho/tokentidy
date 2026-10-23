# Scripts and CI

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/ci-and-scripts.md).

TokenTidy follows the UNIX way: the standard output has only data, one item per line, and summaries go to the error output. That makes it easy to combine with other tools and to run automatically.

## Filtering the result

The fields of `check` are separated by tabs (position, severity, rule, property, value), so `awk`, `grep`, `cut` and `sort` work directly:

```bash
npx tokentidy check ./src | awk -F'\t' '$3 == "color/hardcoded"'  # colors only
npx tokentidy check ./src | grep -v '\treview\t'                  # violations only
npx tokentidy check ./src | cut -f5 | sort | uniq -c | sort -rn    # most repeated values (token candidates)
```

For anything more complex, use [JSON output](json-output.md).

## An npm script

In your `package.json`:

```json
{
  "scripts": {
    "tokens:check": "tokentidy check src"
  }
}
```

Then `npm run tokens:check`. Inside npm scripts, `npx` isn't needed.

## In CI

`check` ends with exit code `1` when a violation is found ([Exit codes](exit-codes.md)), so the CI step fails. Review items and warnings never fail it. A GitHub Actions job:

```yaml
name: Design tokens
on: [push, pull_request]
jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tokentidy check src
```

Two details for CI:

- `generate` never waits for an answer outside a terminal: when token files already exist, pass `--extend` or `--new`.
- `fix --dry-run` ends with `1` when violations would remain, so it can also be a CI check.

## Before each commit

To check only the files being committed, pass them as paths. With [lint-staged](https://github.com/lint-staged/lint-staged), for example:

```json
{
  "lint-staged": {
    "*.{css,scss,sass,less,html,jsx,tsx}": "tokentidy check"
  }
}
```

A file named explicitly is always analyzed, even a test file a folder scan would skip.
