# Contributing to WeBWorK Preview

Thanks for considering a contribution. This file covers how to get a
development environment running, how the project is structured, and what
kinds of changes are most useful right now.

## Development setup

You need:

- **Node.js 18+** and npm (for the extension)
- **VS Code 1.85+** (for testing)
- **Docker Desktop** (for the renderer the extension talks to)

```bash
# 1. Clone and install
git clone https://github.com/ejauch/webwork-preview.git
cd webwork-preview
npm install

# 2. Start the renderer (in a separate terminal)
cd docker
./setup.sh
# leave this running; the first build takes 10-15 min

# 3. Open the extension folder in VS Code and press F5
code ..
```

Pressing F5 launches an **Extension Development Host** — a separate VS Code
window with the extension loaded from source. Edit the TypeScript, save,
then run **Developer: Reload Window** in the dev host to pick up changes.

## Project layout

```
webwork-preview/
├── src/                          TypeScript source
│   ├── extension.ts              Entry point, command registration
│   ├── renderer-client.ts        HTTP client for the PG renderer
│   ├── preview-panel.ts          Single-seed live preview webview
│   ├── seed-grid.ts              Multi-seed grid webview
│   └── html-wrapper.ts           Webview HTML shell + dark mode CSS
├── syntaxes/
│   └── pg.tmLanguage.json        TextMate grammar for .pg files
├── language-configuration.json   Brackets, comments, etc. for PG
├── docker/                       Renderer setup (separate from extension)
│   ├── setup.sh                  One-shot build & start
│   └── docker-compose.yml
├── test/
│   ├── sample.pg                 Representative PG file for grammar testing
│   └── tokenize.js               Run the grammar against sample.pg
└── package.json                  Extension manifest
```

## Testing changes

The project doesn't ship a formal test suite yet. In practice:

**For TypeScript changes** — run `npx tsc --noEmit` to typecheck. Strict mode
is on; if it compiles, it's mostly safe.

**For grammar changes** — drop a tricky PG snippet into `test/sample.pg`,
then run `node test/tokenize.js`. The output lists every token with its
TextMate scope so you can see what's matching.

**For rendering changes** — F5, open a `.pg` file in the dev host, exercise
the relevant command (preview, seed grid, etc.). Right-click on the preview
and pick "Inspect Element" to open DevTools for the webview specifically;
that's the right place to debug HTML/CSS/JS issues inside the rendered
output.

## Packaging a release

```bash
# Bump version in package.json
npm run compile
npx vsce package
# Produces webwork-preview-X.Y.Z.vsix
```

Install with `code --install-extension webwork-preview-X.Y.Z.vsix`.

Update `CHANGELOG.md` with what changed; tag the commit in git as `vX.Y.Z`.

## What kinds of contributions are most useful

In rough priority order:

1. **Bug reports with reproducible examples.** A `.pg` file that triggers
   the bug + the exact command + what you expected vs. what happened. Open
   an issue.
2. **PG grammar improvements** — if a common idiom isn't highlighted right,
   add a test case to `test/sample.pg` and the corresponding rule to
   `syntaxes/pg.tmLanguage.json`.
3. **Dark mode polish** — particular elements (Knowls, MathQuill, alerts)
   that don't look right in dark mode. CSS-only fix in `html-wrapper.ts`.
4. **Performance** — for large `.pg` files or large seed-grid runs, look
   at the request coalescing in `preview-panel.ts` and the concurrency
   limit in `seed-grid.ts`.
5. **New features** — see the roadmap below. Open an issue first if you're
   planning something larger than a small fix, so we can agree on the
   approach before you sink time into it.

## Rough roadmap

- Status bar item showing current seed
- Snippets for common PG scaffolding patterns
- Setting for custom templates / macros directory (auto-mount into renderer)
- "Catch broken seeds" mode for the grid (flag seeds where answer = 0,
  variant differs wildly in display length, etc.)
- Problem outline view (symbol provider)
- PG documentation on hover
- Bundled MathJax fallback (so the extension works without the renderer
  for syntax highlighting and basic preview)

## Licensing

By contributing, you agree that your contributions will be licensed under
GPL v3 (or later), the same license as the rest of the project.

## Code style

- TypeScript strict mode
- 2-space indentation
- Single quotes for strings, double quotes only when needed inside templates
- Prefer named exports over default exports
- Add a brief comment block at the top of each file describing what it does
- Inline comments should explain *why*, not *what* (the code shows the what)
