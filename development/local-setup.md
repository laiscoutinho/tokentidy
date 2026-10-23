# Local setup

How to run, test and package TokenTidy from the source. User documentation is in [docs/](../docs/).

## Requirements

Node.js **22.20 or later**. Node runs the `.ts` files directly (type stripping), so there is no build step while developing; the build only produces the package (`dist/`, JavaScript and types).

## First time

```bash
git clone https://github.com/laiscoutinho/tokentidy.git
cd tokentidy
npm install    # installs the dependencies and builds dist/ (the prepare script)
```

## Day to day

| Command | What it does |
|---|---|
| `npm run dev -- check ./src` | Runs the CLI straight from the TypeScript source. The `--` separates npm's options from the CLI's |
| `npm test` | Runs `test/**/*.test.ts` with the coverage floor (lines 90%, branches 85%); fails below it |
| `npm run typecheck` | Type-checks `src/` and `test/` without emitting files (unused imports and variables are errors) |
| `npm run check` | Type checking + tests: what CI runs |
| `npm run build` | Compiles `src/` into `dist/` |
| `npm run build:watch` | Recompiles on every change (useful with `npm link`) |

## Global command with `npm link`

| Command | What it does |
|---|---|
| `npm link` | Creates the global `tokentidy` command, pointing to this project's `dist/`. Run it again after switching Node versions with nvm |
| `npm unlink -g tokentidy` | Removes the global command |

`npm link` points to `dist/`, so after changing the code run `npm run build` (or keep `npm run build:watch` open).

## Test as a user (real install)

`npm link` uses the whole project folder, so it hides problems like a file left out of the package or an undeclared dependency. To install TokenTidy the way a user would, use `npm pack`, which builds the same package that would go to npm.

Manual tests live in the lab, outside this repository: `../tcc-labs/testar-tokentidy/`, one folder per version (its README has the full flow and the results of each version).

```bash
# 1. At the tokentidy/ root: builds and creates tokentidy-X.Y.Z.tgz
npm pack

# 2. In the lab, create the version folder and install the package as a dev dependency
mkdir -p ../tcc-labs/testar-tokentidy/vX.Y.Z
mv tokentidy-X.Y.Z.tgz ../tcc-labs/testar-tokentidy/vX.Y.Z/
cd ../tcc-labs/testar-tokentidy/vX.Y.Z
npm init -y && npm install -D ./tokentidy-X.Y.Z.tgz

# 3. Use it like a user would, on the lab's base projects
npx tokentidy --help
npx tokentidy check ../../todo-list-original/react/todo-list-react
```

| Command | What it does |
|---|---|
| `npm pack --dry-run` | Lists the files that would go in the package, without creating the `.tgz` |
| `npm pack` | Creates the `.tgz` (ignored by git) |

`npm pack` runs the build first (the `prepare` script, which also runs on `npm install` and when installing from GitHub). The package contains `dist/`, `NOTICE`, `LICENSE`, `README.md` and `package.json` (the `files` field). Unlike `npm link`, it is a copy: after changing the code, run `npm pack` and `npm install -D` again.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main`, on pull requests and on version tags (`v*`):

- `npm run check` on Linux, Windows and macOS, with Node 22.20.0 (the minimum in `engines`), 22 and 24;
- a package smoke test on Linux: `npm pack`, install the `.tgz` in an empty project and run `tokentidy --version` and `tokentidy check` on a fixture;
- `npm audit --omit=dev` (vulnerabilities in the runtime dependencies).

Dependabot opens monthly pull requests to update the GitHub Actions used by the workflow.

## Releases

A release is only a git tag `vX.Y.Z` equal to `version` in `package.json`. The version bump goes in the last commit of the version; there is no `chore(release)` commit, GitHub Release or npm publish for now.
