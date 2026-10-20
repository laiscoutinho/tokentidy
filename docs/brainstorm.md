# About TokenTidy

TokenTidy is a command-line tool that finds design values written "by hand" in CSS, React and Angular projects, points out which design token should be used instead, fixes the code safely and, when the project has no tokens yet, helps create them with names that make sense.

---

## 1. The problem it solves

Every interface project needs visual consistency: the same colors, the same spacing, the same typography on every screen. To guarantee this, teams create **design tokens**, which are official names for the project's visual decisions (for example, "primary color", "medium spacing", "heading size").

In practice, though, the code drifts away from that standard without anyone noticing. Someone copies a blue from somewhere else and pastes it into the file. Someone else writes "17px" because it looked right at the time. A third person uses a gray "almost equal" to the system's. Over time, the project piles up dozens or hundreds of hardcoded values that should be tokens. Each one makes it harder to change the look, keep the theme, ensure accessibility and preserve the product's identity.

There is a second problem, before that one: many projects **never had tokens at all**. There's no reference file to compare against, and creating one from scratch out of existing code is slow, manual work full of subjective decisions.

TokenTidy was designed to tackle both problems: **detect and fix drift** where a standard already exists and **help create the standard** where it doesn't exist yet.

## 2. Goal

**General goal:** make adopting and maintaining design tokens in front-end projects easier, in a simple, safe and transparent way.

**Specific goals:**

- Identify, in style and component files, the hardcoded values that should be tokens.
- Say, for each one, which token to use, and explain why that token was chosen.
- Automatically fix what can be fixed without risk, and show beforehand what will change.
- Suggest new tokens when the project already has a token set, but there are repeated values it doesn't cover.
- Generate a proposed token file, with semantic names, when the project has none.
- Be easy to install, understand and integrate into a team's workflow.

## 3. Who it's for

- **Front-end developers** who want to keep the code aligned with the design system without reviewing everything by hand.
- **Designers and design system owners** who need to know how far the real code is drifting from what was designed.
- **Teams getting started** with tokens in an old project who don't know where to begin.
- **Researchers and students** interested in front-end code quality and visual consistency.

## 4. How it works (overview)

TokenTidy works in four steps, always in the same order:

1. **Reads the project.** Walks the folders, ignores what doesn't matter (dependencies, generated files, version control) and selects style and component files.
2. **Understands the code.** Instead of just searching for text, the tool interprets the structure of each file. That's why it can tell a value that really is a color from text that only looks like one, and can point to the exact position of each value, down to line and column.
3. **Compares with the tokens.** Each hardcoded value is compared with the project's tokens. The comparison is smart: `#FFF`, `#ffffff` and `rgb(255, 255, 255)` are recognized as the same color, and `16px` and `1rem` as the same size (with a configurable base).
4. **Reports, suggests or fixes.** Depending on the chosen command, it only shows the findings, proposes improvements or changes the files.

## 5. What it analyzes

### CSS and SCSS

Analyzes style files, including those using SCSS features (variables, reusable snippets, line comments). It checks values for:

- **Color** (text, background, borders, shadows and the like);
- **Spacing** (margins, padding, distances between elements);
- **Typography** (size, line height, font family and weight).

When a property bundles several values in a single line (for example, an element's four margins), each part is evaluated separately and gets its own location.

### React

Analyzes styles written directly in components (JSX and TSX). It understands React's particularities, like property names written differently from traditional CSS and numeric values React interprets as pixels. Styles in CSS files imported by components are treated as regular CSS.

### Angular

Analyzes Angular component styles, both those written inside the component itself and those in separate files, plus styles applied directly in templates. For the user, the result is the same as for the other technologies: a report with the location of each value, even when it sits inside a component file.

### What is **not** considered a violation

Not every hardcoded value is a problem. By default, TokenTidy recognizes and lets through values that usually don't represent a design decision, like `0`, `auto`, `inherit`, `transparent` and `currentColor`, plus values that **already use** a token or variable. It also respects snippets the team explicitly marked to be ignored.

## 6. What it does, in detail

### 6.1 Detect violations

The tool walks the project and lists each hardcoded value that should be a token. For each finding, it reports:

- the file, line and column;
- the original slice;
- the value type (color, spacing or typography);
- the status of the match with the tokens (see below).

Files with syntax errors don't stop the analysis: the problem is recorded and the tool moves on to the other files.

### 6.2 Suggest the right token

For each value, the tool tries to find a matching token and classifies the result in three levels:

- **Exact:** the value equals a token's. The suggestion is direct and can be fixed automatically.
- **Close:** the value isn't equal, but is within a tolerance defined by the team. The tool points to the closest token and **explains the choice**, for example showing how far the color is from the suggested token. By default, these cases are only suggestions.
- **No suggestion:** there's no close enough token. The value is pointed out, but with no replacement proposed.

When more than one token fits equally well, the tool uses a fixed, documented tie-breaking criterion, so the result is always the same for the same input.

Color comparison takes into account how people **perceive** differences between colors, not just the numeric difference between codes. That makes "close color" more faithful to what is actually seen on screen.

### 6.3 Understand the role of each value

The same number doesn't always mean the same decision. TokenTidy looks at **where and how** a value is used before deciding whether it should be a token, and which one:

- An `800px` width that sets the maximum width of the page content on every screen is a layout decision, and a token candidate. The same `800px` setting the width of a card is a different decision; the two shouldn't become one token just because the number matches.
- Different values can be the same decision: a page container's `max-width` written with slightly different numbers, or a `vw` in one place that plays the same role as a `rem` elsewhere, may deserve a single token.
- Values hidden in fallbacks (`var(--space, 12px)`) are mapped too, so they can be checked against the token they fall back from.

The signals come from the code itself: the property, the selector, media queries around it, the declarations next to it and how often the value repeats in the same role. This context feeds both suggestions (6.2) and generation (6.6).

### 6.4 Fix automatically

When asked to fix, the tool replaces hardcoded values with the matching tokens, editing only the necessary slice. The rest of the file (formatting, comments, organization) stays as it was.

The safeguards that come with fixing are part of the proposal:

- **Only what's exact, by default.** Values that are only close are fixed only if the person explicitly asks for it.
- **Preview first.** You can see everything that would change before anything is written.
- **Warning about pending changes.** If the project has changes not yet saved in version control, the tool warns before rewriting files.
- **Predictable result.** Running the fix twice changes nothing the second time.
- **Report of what changed.** At the end, the tool reports which files were changed and how many fixes were made.

### 6.5 Suggest new tokens

When the project already has tokens, but some values show up many times without being covered by any of them, the tool highlights those cases as candidates for new tokens. For each candidate, it shows how many times the value appears and where, helping the team decide what's worth formalizing.

### 6.6 Generate a token file

When the project has no tokens, the tool proposes one. The process is:

1. collect every hardcoded value in the project;
2. group very similar values (for example, two nearly identical grays or 15 and 16 pixel spacings), picking one representative per group, and taking each value's role into account (6.3);
3. prioritize the most repeated values;
4. give each token a **semantic name**, describing the value's role rather than its appearance;
5. write the proposal to a token file in an open, standard format.

Generation is always a **proposal for human review**: it first shows what would be created, never overwrites an existing token file and always produces the same result for the same project. Names follow a taxonomy built on a published research method (Nickerson, Varshney and Muntermann, 2013), so the naming has criteria and can be justified.

## 7. Options and commands

### Commands

| Command | What it does |
|---|---|
| `tokentidy check` | Analyzes the project and reports violations. Doesn't change any file. It's the default behavior. |
| `tokentidy suggest` | Points out recurring values that aren't tokens yet and deserve to become tokens. |
| `tokentidy generate` | Creates a proposed token file from the project. |

### Options

| Option | What it does |
|---|---|
| `--fix` | Applies the safe fixes (exact values) to the files and reports what changed. |
| `--dry-run` | Shows what would change, without writing anything. |
| `--fix-approximate` | Also fixes values that are only close. Requires an explicit request. |
| `--tokens <path>` | Sets which token file to use. |
| `--tolerance <value>` | Sets how much a value may differ from a token to count as "close". |
| `--ignore <pattern>` | Excludes folders, files or file types from the analysis. |
| `--json` | Delivers the result in a structured format, for automation. |
| `--quiet` | Reduces the output to the essentials. |
| `--no-color` | Turns off colors in the terminal. |
| `--force` | Allows writing even with pending changes in version control. |
| `--help` | Shows help, with usage examples. |
| `--version` | Shows the installed version. |

### Project configuration

Besides command-line options, the team can store its choices in a configuration file versioned with the project: where the tokens are, what to ignore, the tolerance, which value types to check and which exceptions to accept. That way everyone and the continuous integration environment use the same rules. Options given on the command line take precedence over the file.

### Exit codes and continuous integration

The tool signals the result to whoever runs it: one code means "no violations", another "violations found" and another "usage or execution error". With that, a team can make the token check block a delivery that introduces new drift. The structured output (`--json`) makes it easy to record and track results over time.

## 8. What makes TokenTidy different

These are the points that define the tool's proposal:

1. **Understands context, not just values.** Most tools treat every hardcoded value the same way. TokenTidy looks at the role a value plays (page layout or component, the same decision written in different units) to decide what should become a token and which token fits. This is what keeps suggestions useful instead of noisy (6.3).

2. **Serves those who don't have tokens yet.** In the tools studied during the project, the focus is usually on checking code against tokens that already exist. TokenTidy also covers the starting point: it analyzes the project and proposes the tokens it doesn't have yet. That greatly lowers the barrier for teams with old projects.

3. **Semantic names with a scientific basis.** Generated tokens don't get arbitrary names like "color 1" or "color 2". The naming follows a taxonomy built with a published, recognized method, which gives it coherence and makes it possible to justify the decisions, including in an academic context.

4. **Suggestions that explain themselves.** The tool doesn't just say "this is wrong". It shows which token it proposes, how far the value is from it and why it was chosen, so the person can trust the suggestion or disagree with good reason.

5. **Fixes that respect your code.** It changes only what's necessary, shows everything before writing, fixes only what's exact by default, warns about pending changes and gives the same result if run again.

6. **Simple to use.** It's a tool you install, run and get results from. It needs no background processes, external services or artificial intelligence. Its behavior is predictable and reproducible.

7. **Angular as part of the core scope.** Many visual quality tools prioritize the React ecosystem. TokenTidy treats Angular with the same care, including styles written inside components and templates.

8. **Rooted in research.** The tool comes from a research project on design token violations in open source front-end projects. That anchors it in observation of real projects, not just opinion about what would be useful.

> **Note on the comparisons:** statements about other tools reflect what was observed while studying them for the project. Before publishing them externally, it's worth checking each tool's current documentation again.

## 9. Design principles

- **Never surprise.** Nothing changes without an explicit request, and everything that will change can be seen first.
- **Always explain.** Every finding and every suggestion comes with its reason.
- **Be conservative.** When in doubt, suggest instead of fixing.
- **Be predictable.** The same input always produces the same result.
- **Be robust.** A file with a problem doesn't stop the analysis of the rest of the project.
- **Be simple.** Do few things and do them well; features outside the scope are consciously turned down.
- **Respect the user.** No usage data is collected and nothing is sent off the computer.

## 10. Usage scenarios

**Scenario 1: project with tokens, in progress.** The team runs the check before each delivery. The tool points out the colors and spacing that drifted from the standard, the developer sees the preview of the fixes, applies the exact ones and reviews the close suggestions by hand.

**Scenario 2: old project, no tokens.** The team asks for generation. The tool proposes a token file with the most recurring values and semantic names. The team reviews it, adjusts names and values, adopts the file and starts using the check normally.

**Scenario 3: project with tokens, but with gaps.** The team asks for suggestions. The tool shows heavily repeated values that have no token and where they appear. The team decides which become new tokens.

**Scenario 4: continuous integration.** The check runs automatically on every change pushed. If new violations show up, the process fails and the report says exactly where to fix them.

## 11. Limits and what's out of scope

To keep the tool simple and reliable, some things are deliberately left out:

- **Tailwind** and other utility-class approaches.
- **Artificial intelligence** and integrations with automated assistants.
- **Dynamic styles**, computed only while the program runs. Only values written literally are analyzed.
- **Version control history** and **batch analysis of multiple repositories.**
- **Styles written with CSS-in-JavaScript libraries**, which aren't part of the initial scope.

These limitations are stated so users know exactly what to expect.

## 12. Project status

TokenTidy is under development, as part of an undergraduate research project at IFCE dedicated to studying design token violations in open source front-end projects. It's built in phases, starting with detection in CSS and moving on to React, Angular, automatic fixing and token generation. This document describes what the tool sets out to be and may be updated as each capability is completed.
