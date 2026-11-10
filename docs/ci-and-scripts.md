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
      - run: npx tokentidy validate
```

`validate` fails the step when a token file has a broken alias, a cycle or doesn't follow the DTCG schema ([validate](validate.md)).

Three details for CI:

- `generate` never waits for an answer outside a terminal: when token files already exist, pass `--extend` or `--new`.
- `fix --dry-run` ends with `1` when violations would remain, so it can also be a CI check.
- `fix --approximate` never waits for an answer either: pass `--yes` (apply what passes the guards; groups rejected in `tokentidy.decisions.json` stay rejected) or `--no-input` (only list).

## Annotations on the pull request

With `--format github`, each violation and syntax error becomes an error annotation on the line of the diff, and each review item becomes a notice:

```yaml
      - run: npx tokentidy check --format github
```

The exit code is the same, so the step still fails when there are violations. Paths are relative to the current folder, which in Actions is the repository root.

## In a project that already has violations

Save a [baseline](check.md#adopting-it-in-a-project-that-already-has-violations) and commit it, so the build only fails on new violations:

```bash
npx tokentidy check --print-baseline > tokentidy.baseline.json
npx tokentidy check --baseline tokentidy.baseline.json
```

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

Only the committed files are reported, and they are judged with the whole project in view ([Analyzing part of a project](check.md#analyzing-part-of-a-project)), so the answer matches a full run. The cost is reading the project on each commit.
