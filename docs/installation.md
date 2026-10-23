# Installation

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/installation.md).

New to the terminal? Read [Terminal basics](terminal-basics.md) first.

## 1. Check Node.js

TokenTidy needs **Node.js 22.20 or later**. In a terminal, run:

```bash
node --version
```

If it prints `v22.20.0` or a higher number (`v24.x`, for example), you are ready. If it says the command was not found, or prints a lower version, install the **LTS** version from [nodejs.org](https://nodejs.org/) and open a new terminal.

## 2. Install TokenTidy in your project

TokenTidy is not on the npm registry yet, so it is installed straight from GitHub. Inside your project folder (the one with `package.json`), run:

```bash
npm install -D github:laiscoutinho/tokentidy
```

`-D` installs it as a **development dependency**: it helps you while coding and doesn't go into the app your users download.

## 3. Check that it works

```bash
npx tokentidy --version
```

It prints the installed version, for example `0.0.9`. To see the commands:

```bash
npx tokentidy --help
```

## Updating and removing

| What | Command |
|---|---|
| Update to the latest version on GitHub | `npm install -D github:laiscoutinho/tokentidy` (the same command again) |
| Remove TokenTidy from the project | `npm uninstall tokentidy` |

## Next step

[Quick start](quick-start.md): your first analysis in three commands.
