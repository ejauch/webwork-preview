"use strict";
/**
 * Wraps the raw HTML returned by the PG renderer for display in a VS Code
 * webview.
 *
 * Strategy: drop the renderer's full HTML into an iframe's `srcdoc` attribute.
 * The iframe creates an isolated document where the renderer's <base> tag and
 * relative URLs resolve to localhost:3000 (MathJax, jQuery, Bootstrap, CSS,
 * fonts all load normally).
 *
 * Dark mode: when enabled, we inject a CSS override block into the
 * renderer's <head> before serializing. The CSS uses high-specificity rules
 * to flip background and text colors onto a dark palette, while explicitly
 * leaving images and MathJax-SVG math alone (math gets re-colored to a light
 * shade to remain visible).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapPreviewHtml = wrapPreviewHtml;
exports.getDarkModeCss = getDarkModeCss;
exports.wrapErrorHtml = wrapErrorHtml;
const TOOLBAR_CSS = `
  :root {
    --ww-bg: var(--vscode-editor-background);
    --ww-fg: var(--vscode-editor-foreground);
    --ww-border: var(--vscode-panel-border, rgba(128,128,128,0.3));
    --ww-accent: var(--vscode-textLink-foreground, #3794ff);
    --ww-error-bg: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    --ww-error-border: var(--vscode-inputValidation-errorBorder, #be1100);
    --ww-muted: var(--vscode-descriptionForeground, #9d9d9d);
  }
  html, body {
    margin: 0;
    padding: 0;
    height: 100vh;
    background: var(--ww-bg);
    color: var(--ww-fg);
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    display: flex;
    flex-direction: column;
  }
  .ww-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    background: var(--ww-bg);
    border-bottom: 1px solid var(--ww-border);
  }
  .ww-toolbar .ww-filename {
    font-weight: 600;
  }
  .ww-toolbar .ww-seed {
    color: var(--ww-muted);
    font-variant-numeric: tabular-nums;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .ww-toolbar button {
    background: transparent;
    color: var(--ww-fg);
    border: 1px solid var(--ww-border);
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: inherit;
  }
  .ww-toolbar button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
  }
  .ww-status {
    margin-left: auto;
    color: var(--ww-muted);
    font-size: 0.9em;
    font-style: italic;
  }
  .ww-error {
    flex: 0 0 auto;
    background: var(--ww-error-bg);
    border-left: 3px solid var(--ww-error-border);
    padding: 10px 14px;
    margin: 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.92em;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ww-frame {
    flex: 1 1 auto;
    border: 0;
    width: 100%;
    background: white;
  }
  .ww-frame.dark {
    background: #1e1e1e;
  }
`;
/**
 * CSS injected into the renderer's HTML <head> when dark mode is on. Designed
 * to override Bootstrap's light defaults without breaking layout or images.
 *
 * Color palette mirrors VS Code's "Dark+" theme so the iframe content visually
 * matches the toolbar outside it:
 *   bg          #1e1e1e   (page background)
 *   surface     #252526   (slightly lighter — cards, panels)
 *   border      #3c3c3c
 *   text        #d4d4d4   (light gray, not pure white)
 *   muted       #9d9d9d
 *   accent      #569cd6
 *   error       #f48771
 *
 * Math (MathJax-SVG) is re-colored via a `color:` override on the SVG which
 * MathJax v3 honors as the math fill color.
 */
const DARK_MODE_CSS = `
<style id="ww-dark-mode">
  html, body {
    background: #1e1e1e !important;
    color: #d4d4d4 !important;
  }
  /* Containers / cards / problem chrome */
  .container, .container-fluid, .row, .col, .col-12,
  .problem, .problem-content, .PGML,
  .card, .card-body, .modal-content {
    background: #1e1e1e !important;
    background-color: #1e1e1e !important;
    color: #d4d4d4 !important;
    border-color: #3c3c3c !important;
  }
  /* Bootstrap text utility classes */
  .text-muted { color: #9d9d9d !important; }
  .text-danger { color: #f48771 !important; }
  .text-success { color: #6fbf73 !important; }
  .text-primary { color: #569cd6 !important; }
  .text-warning { color: #d7ba7d !important; }
  /* Links */
  a, a:visited { color: #569cd6 !important; }
  a:hover { color: #9cdcfe !important; }
  /* Headings inherit body color */
  h1, h2, h3, h4, h5, h6 { color: #d4d4d4 !important; }
  /* Borders, separators */
  hr { border-color: #3c3c3c !important; }
  /* Form controls — keep answer blanks usable */
  input, textarea, select {
    background: #2d2d2d !important;
    color: #d4d4d4 !important;
    border-color: #3c3c3c !important;
  }
  input::placeholder { color: #6e6e6e !important; }
  /* MathQuill answer fields */
  .mq-editable-field, .mq-math-mode {
    background: #2d2d2d !important;
    color: #d4d4d4 !important;
    border-color: #3c3c3c !important;
  }
  .mq-cursor { border-color: #d4d4d4 !important; }
  /* Buttons */
  .btn { border-color: #3c3c3c !important; }
  .btn-primary { background: #0e639c !important; border-color: #0e639c !important; color: #fff !important; }
  .btn-secondary, .btn-default {
    background: #3a3d41 !important; border-color: #3c3c3c !important; color: #d4d4d4 !important;
  }
  /* MathJax-SVG math: re-color to light gray. MathJax v3 outputs math as
     SVG with fill="currentColor", so setting color on the container
     propagates. We use mjx-container to target without affecting raw SVG
     images that might appear in a problem. */
  mjx-container, mjx-container svg, .MathJax, .MathJax_Display {
    color: #d4d4d4 !important;
    fill: #d4d4d4 !important;
  }
  /* Legacy script-tag math is replaced by mjx-container at runtime; covered above. */
  /* Tables */
  table { color: #d4d4d4 !important; background: transparent !important; }
  table, th, td { border-color: #3c3c3c !important; }
  thead th { background: #2d2d2d !important; }
  tbody tr:nth-child(even) { background: rgba(255,255,255,0.02) !important; }
  /* Code blocks and pre */
  code, pre, kbd, samp {
    background: #2d2d2d !important;
    color: #ce9178 !important;
    border-color: #3c3c3c !important;
  }
  /* Alerts (Bootstrap) — keep them tinted but readable */
  .alert {
    background: #252526 !important;
    border-color: #3c3c3c !important;
    color: #d4d4d4 !important;
  }
  .alert-danger { border-left: 4px solid #f48771 !important; }
  .alert-warning { border-left: 4px solid #d7ba7d !important; }
  .alert-success { border-left: 4px solid #6fbf73 !important; }
  .alert-info { border-left: 4px solid #569cd6 !important; }
  /* Images: do NOT invert. PG problems often embed graphs and figures that
     are intentionally on white backgrounds; inverting them produces garbage.
     Instead, give them a subtle light backdrop so they're not jarring. */
  img {
    background: #f0f0f0 !important;
    padding: 4px !important;
    border-radius: 2px !important;
  }
  /* But not the favicon or tiny icons */
  img[width="16"], img[height="16"],
  .fa, .fas, .far, .fab { background: transparent !important; padding: 0 !important; }
  /* Knowls (clickable hints in PG) */
  .knowl-link { color: #569cd6 !important; }
  .knowl-content { background: #252526 !important; border-color: #3c3c3c !important; }
</style>
`;
function htmlEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function attrEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/**
 * Inject the dark mode <style> block into the renderer's HTML by inserting it
 * just before </head>. If for some reason there's no </head>, we fall back to
 * prepending the style to the document.
 */
function injectDarkMode(rendered) {
    const idx = rendered.toLowerCase().indexOf('</head>');
    if (idx >= 0) {
        return rendered.slice(0, idx) + DARK_MODE_CSS + rendered.slice(idx);
    }
    return DARK_MODE_CSS + rendered;
}
function wrapPreviewHtml(args) {
    const errBlock = args.error
        ? `<div class="ww-error">${htmlEscape(args.error)}</div>`
        : '';
    const rendered = args.darkMode ? injectDarkMode(args.rendered) : args.rendered;
    const srcdoc = attrEscape(rendered);
    const frameClass = args.darkMode ? 'ww-frame dark' : 'ww-frame';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${TOOLBAR_CSS}</style>
</head>
<body>
  <div class="ww-toolbar">
    <span class="ww-filename">${htmlEscape(args.filename)}</span>
    <span class="ww-seed">seed: ${args.seed}</span>
    <button id="ww-reroll" title="Render with a new random seed">↻ Random seed</button>
    <span class="ww-status" id="ww-status"></span>
  </div>
  ${errBlock}
  <iframe class="${frameClass}"
          id="ww-frame"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          srcdoc="${srcdoc}"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('ww-reroll').addEventListener('click', () => {
      vscode.postMessage({ type: 'reroll' });
    });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'status') {
        document.getElementById('ww-status').textContent = msg.text || '';
      }
    });
  </script>
</body>
</html>`;
}
/**
 * Exposed so the seed grid can use the same dark mode CSS for its iframes.
 */
function getDarkModeCss() {
    return DARK_MODE_CSS;
}
function wrapErrorHtml(message, seed) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${TOOLBAR_CSS}</style>
</head>
<body>
  <div class="ww-toolbar">
    <span class="ww-filename">Preview unavailable</span>
    <span class="ww-seed">seed: ${seed}</span>
  </div>
  <div class="ww-error">${htmlEscape(message)}</div>
  <p style="color: var(--ww-muted); padding: 16px;">
    Check that the PG renderer is running. By default the extension expects it
    at <code>http://localhost:3000</code>. Run
    <code>WeBWorK: Check Renderer Connection</code> from the command palette
    to verify, or update <code>webworkPreview.rendererUrl</code> in settings.
  </p>
</body>
</html>`;
}
//# sourceMappingURL=html-wrapper.js.map