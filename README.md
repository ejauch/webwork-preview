# WeBWorK Preview — VS Code Extension

Live preview of WeBWorK `.pg` problem files inside VS Code, with multi-seed
testing for catching rendering bugs early.

**License:** GPL v3 (see [LICENSE](LICENSE)). Matches the licensing of the
underlying [WeBWorK PG renderer](https://github.com/openwebwork/renderer).

## What it does

- **Syntax highlighting** for `.pg` files: PG-specific macros (`loadMacros`,
  `Context`, `Compute`, `Formula`, `ANS`, MathObject constructors), PGML and
  legacy `BEGIN_TEXT` blocks (with inline math `[`…`]` and answer rules
  `[_____]` highlighted distinctly), Perl variables and keywords, comments,
  and embedded Perl inside `[@ … @]` PGML evaluations.
- **Side-by-side preview** of the active `.pg` file, auto-refreshing on save
  (and optionally on every edit, debounced). Looks like a live WeBWorK
  instance — Bootstrap styling, MathJax, MathQuill answer fields all render
  the same way they would in a real course.
- **Seed control** — set a specific seed or reroll a random one. The current
  seed is always visible in the preview header so you can reproduce a render.
- **Multi-seed grid** — render the same problem against 12 (configurable)
  sequential seeds in parallel and view the results side-by-side. Useful for
  catching seeds that produce degenerate values, broken MathJax, or
  inconsistent formatting.
- **Dark mode** — opt-in Dark Reader-style color inversion of the rendered
  problem content (toggleable in settings). Re-colors backgrounds, text,
  borders, and MathJax math; preserves embedded images on light backings so
  graphs stay legible.
- **No answer checking** — preview-only. The submit buttons are hidden so the
  rendered output focuses on the problem text and math.

## One-time setup

### 1. Install Docker

The extension talks over HTTP to the official WeBWorK PG renderer running in a
Docker container on your machine. You need Docker Desktop (macOS/Windows) or
Docker Engine (Linux). Nothing in the extension is Docker-specific — if you
already have the PG renderer running another way, just point
`webworkPreview.rendererUrl` at it.

### 2. Start the renderer

The renderer isn't published as a prebuilt image, so we clone its source and
build it locally. There's a setup script that handles all of this:

```bash
cd docker
./setup.sh
```

The script:
1. Clones `github.com/openwebwork/renderer` into `docker/renderer-src/` (with
   submodules — PG itself ships as a submodule of the renderer).
2. Clones the Open Problem Library into `docker/opl/` (about 1 GB; this gets
   bind-mounted into the container at runtime).
3. Builds the Docker image from the renderer source. First build takes 10–15
   minutes; the resulting image is ~3 GB.
4. Starts the container in the background and waits until it answers HTTP.

Total disk usage: about 4 GB. Re-run `./setup.sh` later to update both the
renderer and the OPL to their latest versions.

Verify it's running from outside the script with:

```bash
curl http://localhost:3000/
```

You should get back HTML. From inside VS Code you can run the
**WeBWorK: Check Renderer Connection** command instead.

Day-to-day operation (after first setup):

```bash
docker compose up -d       # start the renderer
docker compose down        # stop it
docker compose logs -f     # tail the logs (useful when a problem won't render)
```

### 3. Install the extension

From this directory:

```bash
npm install
npm run compile
npx vsce package
```

That produces `webwork-preview-0.1.4.vsix` (or whatever the current version is).
Install it with:

```bash
code --install-extension webwork-preview-0.1.4.vsix
```

Or during development, open this folder in VS Code and press `F5` to launch an
Extension Development Host with the extension loaded.

## Usage

Open any `.pg` file, then:

- **WeBWorK: Show Preview to the Side** — opens the live preview panel. Also
  available as the preview icon in the editor title bar.
- **WeBWorK: Render with Random Seed** — picks a new random seed and re-renders.
- **WeBWorK: Set Seed…** — set a specific seed (handy when reproducing a bug).
- **WeBWorK: Test Multiple Seeds (Grid)** — opens the seed grid view.

Save the file to trigger an auto-refresh. To re-render on every keystroke
(debounced), enable `webworkPreview.autoRefreshOnEdit` in settings.

## Settings

| Setting | Default | Description |
|---|---|---|
| `webworkPreview.rendererUrl` | `http://localhost:3000` | Where the PG renderer is listening. |
| `webworkPreview.defaultSeed` | `1234` | Seed used the first time a preview opens. |
| `webworkPreview.autoRefreshOnSave` | `true` | Re-render when the file is saved. |
| `webworkPreview.autoRefreshOnEdit` | `false` | Re-render while typing (debounced). |
| `webworkPreview.editDebounceMs` | `600` | Debounce delay for `autoRefreshOnEdit`. |
| `webworkPreview.gridSeedCount` | `12` | Number of seeds in the multi-seed grid. |
| `webworkPreview.gridSeedStart` | `1` | First seed used in the grid (sequential from this value). |
| `webworkPreview.darkMode` | `false` | Apply a dark color scheme to rendered problem content. Re-colors backgrounds, text, borders, and MathJax math; preserves embedded images on light backings. |

## Using your own templates / custom macros

For now, this requires editing `docker/docker-compose.yml`. Uncomment the
`volumes:` block under the `pg-renderer` service and point it at your local
templates directory:

```yaml
    volumes:
      - /Users/erich/Westminster/mat305/templates:/usr/app/private
```

Restart the container (`docker compose down && docker compose up -d`). Any
`loadMacros("private/my-macro.pl")` calls from your problems will resolve
against that mount.

A future version will surface this as an extension setting and reload the
container automatically.

## Architecture

```
┌─────────────────────────────┐         ┌────────────────────────┐
│  VS Code                    │         │  Docker                │
│                             │         │                        │
│  ┌──────────────┐           │         │  ┌──────────────────┐  │
│  │ .pg editor   │           │  HTTP   │  │ PG renderer      │  │
│  └──────┬───────┘           │  POST   │  │ (Mojolicious)    │  │
│         │ on save / on edit │ ─────►  │  │                  │  │
│         ▼                   │         │  │ /render-api      │  │
│  ┌──────────────┐           │         │  │                  │  │
│  │ Preview      │ ◄──── HTML│ ──────  │  │ + OPL volume     │  │
│  │ webview      │           │         │  └──────────────────┘  │
│  └──────────────┘           │         │                        │
└─────────────────────────────┘         └────────────────────────┘
```

The extension never executes PG code itself — it just shuttles problem source
to the renderer over HTTP and displays the HTML response inside an iframe.
The renderer's own MathJax, jQuery, and Bootstrap assets load from
`localhost:3000` via the iframe's document context, so the rendered output
looks identical to a live WeBWorK instance.

## Troubleshooting

**"Could not reach renderer"** — Run `docker compose ps` to verify the
container is up. If it isn't, `docker compose logs pg-renderer` will show the
startup output. The first build is the slow step; once the image exists,
restarts are seconds.

**"denied" or "manifest unknown" errors when starting** — These mean Docker
tried to pull a prebuilt image and couldn't find one. The renderer is built
from source, not pulled. Make sure you ran `./setup.sh` first; if you only ran
`docker compose up`, it can't build without the source checkout.

**Problem renders blank or with raw `[`…`]` markup visible** — The PG source
likely failed to compile. With `MOJO_MODE=development` (the default in our
compose file), the error should appear in the preview. If not,
`docker compose logs pg-renderer` will show the Perl error.

**Math doesn't typeset** — MathJax is loaded by the renderer's HTML from
`localhost:3000`, so it only works while the renderer container is running.
Run **WeBWorK: Check Renderer Connection** from the command palette to confirm.

**Dark mode looks wrong on a specific element** — The dark mode CSS uses
high-specificity overrides for common Bootstrap and PG selectors, but a
custom macro that hardcodes inline styles can win the specificity battle.
Open an issue with the problem source and we can extend the override rules.

## Contributing

Contributions welcome — bug reports, feature requests, and pull requests all
appreciated. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup,
testing notes, and the rough roadmap.

## License

This extension is licensed under the GNU General Public License v3.0 or later
(see [LICENSE](LICENSE)). This matches the licensing of the
[WeBWorK PG renderer](https://github.com/openwebwork/renderer) the extension
talks to.

## Credits

- [WeBWorK](https://github.com/openwebwork) — the open-source online homework
  system the PG renderer comes from. This extension would not be possible
  without their work.
- The PG language and the Open Problem Library, maintained by the WeBWorK
  community.

## Author

Built by Dr. Erich Jauch(Westminster College, Department of Mathematics and Physics)
as a tool for authoring PG problems without a live WeBWorK server.
