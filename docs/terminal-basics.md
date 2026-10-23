# Terminal basics

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/terminal-basics.md).

TokenTidy has no window or buttons: you use it by typing commands in a **terminal**. If you have never used one, this page has everything you need to follow the rest of the documentation.

## What a terminal is

A terminal is a window where you type a command, press <kbd>Enter</kbd> and read the answer as text. Every command runs **inside a folder** (the *current folder*), and most commands work on the files of that folder.

## Opening a terminal

| Where | How |
|---|---|
| VS Code | Menu **Terminal → New Terminal**. It opens already inside the project folder |
| Windows | Start menu → **Terminal** (or **PowerShell**) |
| macOS | <kbd>Cmd</kbd> + <kbd>Space</kbd>, type **Terminal**, press <kbd>Enter</kbd> |
| Linux | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd> in most distributions |

The easiest way is VS Code: open your project and then the terminal, and you are already in the right place.

## Moving between folders

| What you want | macOS / Linux | Windows (PowerShell) |
|---|---|---|
| See which folder you are in | `pwd` | `pwd` |
| List the files of the folder | `ls` | `ls` or `dir` |
| Go into a folder | `cd my-project` | `cd my-project` |
| Go back one folder | `cd ..` | `cd ..` |

Run TokenTidy from your **project folder**: the one that has the `package.json` file.

## Reading a command

The commands in this documentation look like this:

```bash
npx tokentidy check src --json
```

| Part | Meaning |
|---|---|
| `npx` | Runs a tool installed in the project (it comes with Node.js) |
| `tokentidy` | The tool |
| `check` | The **command**: what you want TokenTidy to do |
| `src` | An **argument**: here, the folder to analyze. Optional; without it, the current folder is used |
| `--json` | An **option** (always starts with `--`): changes how the command behaves |

In examples, `[paths...]` means "zero or more paths" and `<n>` means "put a value here". A line that starts with `#` after a command is a comment for you to read; you don't need to type it.

## Output and errors

A command can write to two places, both shown in the terminal:

- **standard output** (*stdout*): the result itself, such as the list of values found;
- **error output** (*stderr*): summaries, warnings and errors.

They look the same on screen. The difference matters only when another program reads the result: it reads *stdout* and gets clean data. See [Scripts and CI](ci-and-scripts.md).

When a command ends, it also returns a number called the **exit code**: `0` means all good, other numbers mean something was found or went wrong. See [Exit codes](exit-codes.md).

## Useful keys

| Key | What it does |
|---|---|
| <kbd>↑</kbd> | Brings back the previous command |
| <kbd>Tab</kbd> | Completes a file or folder name |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Stops the command that is running |

## Next step

[Install TokenTidy](installation.md).
