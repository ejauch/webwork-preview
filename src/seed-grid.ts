// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Erich (Westminster College)
// This file is part of WeBWorK Preview. See LICENSE for the full text.

import * as vscode from 'vscode';
import { RendererClient } from './renderer-client';
import { getDarkModeCss } from './html-wrapper';

/**
 * Multi-seed grid view: renders the active .pg file against N sequential seeds
 * in parallel and displays each in its own iframe so the styles of the
 * rendered HTML don't bleed across cells.
 *
 * Each iframe uses `srcdoc` containing the renderer's full HTML so MathJax,
 * jQuery, Bootstrap, etc. all load from localhost:3000 via the renderer's own
 * <base> tag. When the dark mode setting is on we inject a CSS override block
 * into each iframe's <head> before serializing (same approach as the main
 * preview).
 *
 * Sequential seeds (start, start+1, ...) rather than random — reproducibility
 * matters when hunting rendering bugs. "Seed 7 breaks" needs to mean the same
 * thing in two different runs.
 */

export class SeedGridPanel {
  private static current: SeedGridPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(
    context: vscode.ExtensionContext,
    client: RendererClient,
    doc: vscode.TextDocument,
  ) {
    if (SeedGridPanel.current) {
      SeedGridPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      void SeedGridPanel.current.run(doc);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'webworkSeedGrid',
      'WeBWorK Seed Grid',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    SeedGridPanel.current = new SeedGridPanel(panel, client);
    void SeedGridPanel.current.run(doc);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private client: RendererClient,
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  async run(doc: vscode.TextDocument) {
    const cfg = vscode.workspace.getConfiguration('webworkPreview');
    const count = Math.max(1, Math.min(64, cfg.get<number>('gridSeedCount', 12)));
    const start = cfg.get<number>('gridSeedStart', 1);
    const darkMode = cfg.get<boolean>('darkMode', false);
    const seeds = Array.from({ length: count }, (_, i) => start + i);

    this.panel.title = `WeBWorK Seed Grid — ${this.shortName(doc)}`;
    this.panel.webview.html = this.skeleton(seeds, this.shortName(doc), darkMode);

    const source = doc.getText();
    const filePath = doc.uri.fsPath;

    // Parallel render with a small concurrency limit.
    const CONCURRENCY = 4;
    let next = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const idx = next++;
        if (idx >= seeds.length) return;
        const seed = seeds[idx];
        try {
          const result = await this.client.render({
            problemSource: source,
            problemSeed: seed,
            outputformat: 'html',
            sourceFilePath: filePath,
            hideAnswerForms: true,
          });

          const html = darkMode ? injectDarkMode(result.html) : result.html;
          await this.panel.webview.postMessage({
            type: 'cell',
            seed,
            html,
            error: result.error,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await this.panel.webview.postMessage({
            type: 'cell',
            seed,
            html: '',
            error: msg,
          });
        }
      }
    });
    await Promise.all(workers);
    await this.panel.webview.postMessage({ type: 'done' });
  }

  private shortName(doc: vscode.TextDocument): string {
    const parts = doc.uri.path.split('/');
    return parts[parts.length - 1] || doc.uri.toString();
  }

  private skeleton(seeds: number[], filename: string, darkMode: boolean): string {
    const iframeBg = darkMode ? '#1e1e1e' : 'white';
    const cells = seeds
      .map(
        (s) => `
        <div class="cell" id="cell-${s}" data-seed="${s}">
          <div class="cell-header">
            <span class="seed">seed ${s}</span>
            <span class="status" id="status-${s}">rendering…</span>
          </div>
          <iframe id="frame-${s}"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  srcdoc=""></iframe>
        </div>
      `,
      )
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
  }
  header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  header h1 {
    font-size: 1em;
    margin: 0;
    font-weight: 600;
  }
  header .meta {
    color: var(--vscode-descriptionForeground, #9d9d9d);
    font-size: 0.9em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
    padding: 14px;
  }
  .cell {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, #333);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 280px;
  }
  .cell.error { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
  .cell-header {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
  }
  .cell-header .seed { font-weight: 600; }
  .cell-header .status {
    color: var(--vscode-descriptionForeground, #9d9d9d);
    font-style: italic;
  }
  .cell.done .status { color: var(--vscode-charts-green, #6fbf73); font-style: normal; }
  .cell.error .status { color: var(--vscode-errorForeground, #f48771); font-style: normal; }
  iframe {
    flex: 1;
    border: 0;
    background: ${iframeBg};
    width: 100%;
  }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(filename)}</h1>
    <span class="meta">${seeds.length} seeds (${seeds[0]}–${seeds[seeds.length - 1]})</span>
    <span class="meta" id="progress">0 / ${seeds.length}</span>
  </header>
  <div class="grid">
    ${cells}
  </div>
  <script>
    let done = 0;
    const total = ${seeds.length};
    const progress = document.getElementById('progress');

    function attrEscape(s) {
      return String(s).replace(/[&<>"]/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
      }[c]));
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    function fillCell(seed, html, error) {
      const cell = document.getElementById('cell-' + seed);
      const status = document.getElementById('status-' + seed);
      const frame = document.getElementById('frame-' + seed);
      if (error) {
        cell.classList.add('error');
        status.textContent = 'error';
        // For errors, write a simple page directly via document.write (safe
        // because error strings don't contain </script>).
        const doc = frame.contentDocument;
        doc.open();
        doc.write('<pre style="padding:10px;color:#900;font-size:11px;white-space:pre-wrap;">' +
          escapeHtml(error) + '</pre>');
        doc.close();
      } else {
        cell.classList.add('done');
        status.textContent = 'ok';
        // For successful renders, use srcdoc with the renderer's full HTML so
        // its <base> tag and relative URLs resolve correctly.
        frame.setAttribute('srcdoc', attrEscape(html));
      }
      done++;
      progress.textContent = done + ' / ' + total;
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'cell') {
        fillCell(msg.seed, msg.html, msg.error);
      } else if (msg && msg.type === 'done') {
        progress.textContent = 'done — ' + done + ' / ' + total;
      }
    });
  </script>
</body>
</html>`;
  }

  dispose() {
    SeedGridPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inject the dark mode <style> block into the renderer's HTML head. Mirrors
 * the helper in html-wrapper.ts — duplicated here only so this module can
 * call it on each cell's HTML before posting to the webview.
 */
function injectDarkMode(rendered: string): string {
  const idx = rendered.toLowerCase().indexOf('</head>');
  const css = getDarkModeCss();
  if (idx >= 0) {
    return rendered.slice(0, idx) + css + rendered.slice(idx);
  }
  return css + rendered;
}