# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-06-03

### Added
- Dark mode setting (`webworkPreview.darkMode`) that re-colors the rendered
  problem content to a dark palette. Toggles live without requiring a reload.
  Dark Reader-style: re-paints backgrounds, text, borders, MathQuill answer
  fields, and MathJax math; preserves embedded images on light backings so
  graphs stay legible.
- Seed grid honors the dark mode setting in sync with the main preview.

## [0.1.3] - 2026-06-03

### Fixed
- Math now renders correctly in the preview. Previous versions hit a webview
  Content Security Policy issue and a script-tag-nesting parser bug when
  injecting the renderer's HTML via `document.write`. Switched to passing the
  renderer's HTML through an iframe's `srcdoc` attribute, which sidesteps both
  problems and lets the renderer's own MathJax (loaded from `localhost:3000`
  via its `<base>` tag) typeset equations exactly as it would in a live
  WeBWorK instance.

## [0.1.2] - 2026-06-03

### Fixed
- Removed an overly restrictive Content Security Policy meta tag that blocked
  VS Code's own webview helper scripts.

## [0.1.1] - 2026-05-26

### Fixed
- Renderer setup no longer attempts to pull a non-existent prebuilt image
  from GHCR. The `setup.sh` script now clones the renderer source and the
  Open Problem Library separately, then builds the image locally using the
  renderer's plain `Dockerfile` (avoiding a broken step in
  `Dockerfile_with_OPL`).
- Default render output format changed from `json` to `html`, returning the
  renderer's full styled HTML page rather than a JSON-wrapped fragment.

## [0.1.0] - 2026-05-26

### Added
- Initial release.
- TextMate grammar for `.pg` files covering PG-specific macros, MathObject
  constructors, PGML and `BEGIN_TEXT` blocks (with math, fill-in blanks, and
  embedded Perl distinctly scoped), Perl underpinnings, and structural
  anchors (`DOCUMENT()`, `loadMacros`, `ENDDOCUMENT()`).
- Single-seed live preview that auto-refreshes on save and optionally on
  every edit (debounced). Renders inside a VS Code webview panel.
- Seed control: set a specific seed, reroll a random one, or use the
  configurable default.
- Multi-seed grid view that renders N sequential seeds in parallel
  (4-way concurrency) and displays them in a responsive grid for catching
  rendering bugs across variants.
- `WeBWorK: Check Renderer Connection` command for diagnosing setup issues.
- Docker Compose configuration and `setup.sh` script for building and
  running the PG renderer locally.

[Unreleased]: https://github.com/ejauch/webwork-preview/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/ejauch/webwork-preview/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ejauch/webwork-preview/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ejauch/webwork-preview/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ejauch/webwork-preview/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ejauch/webwork-preview/releases/tag/v0.1.0
