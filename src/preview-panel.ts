// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Erich (Westminster College)
// This file is part of WeBWorK Preview. See LICENSE for the full text.

import * as vscode from 'vscode';
import { RendererClient } from './renderer-client';
import { wrapPreviewHtml, wrapErrorHtml } from './html-wrapper';

/**
 * Manages a single preview webview tied to one .pg document.
 * Only one preview panel exists at a time; switching documents updates the content.
 */
export class PreviewPanel {
  private static current: PreviewPanel | undefined;

  private panel: vscode.WebviewPanel;
  private currentDoc: vscode.TextDocument | undefined;
  private currentSeed: number;
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposables: vscode.Disposable[] = [];
  private renderInFlight = false;
  private pendingRender = false;

  static show(
    context: vscode.ExtensionContext,
    client: RendererClient,
    doc: vscode.TextDocument,
    toSide: boolean,
  ) {
    const column = toSide
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.Active;

    if (PreviewPanel.current) {
      PreviewPanel.current.panel.reveal(column, true);
      PreviewPanel.current.setDocument(doc);
      return PreviewPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'webworkPreview',
      'WeBWorK Preview',
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    PreviewPanel.current = new PreviewPanel(context, client, panel, doc);
    return PreviewPanel.current;
  }

  private constructor(
    private context: vscode.ExtensionContext,
    private client: RendererClient,
    panel: vscode.WebviewPanel,
    doc: vscode.TextDocument,
  ) {
    this.panel = panel;
    const cfg = vscode.workspace.getConfiguration('webworkPreview');
    this.currentSeed = cfg.get<number>('defaultSeed', 1234);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Wire up auto-refresh handlers.
    vscode.workspace.onDidSaveTextDocument(
      (d) => this.onDocSaved(d),
      null,
      this.disposables,
    );
    vscode.workspace.onDidChangeTextDocument(
      (e) => this.onDocChanged(e),
      null,
      this.disposables,
    );

    // Allow webview to send messages back (e.g. seed change buttons in the chrome).
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      null,
      this.disposables,
    );

    // Re-render when settings that affect appearance change.
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('webworkPreview.darkMode')) {
          void this.render();
        }
      },
      null,
      this.disposables,
    );

    this.setDocument(doc);
  }

  setDocument(doc: vscode.TextDocument) {
    this.currentDoc = doc;
    this.panel.title = `WeBWorK Preview — ${this.shortName(doc)}`;
    void this.render();
  }

  setSeed(seed: number) {
    this.currentSeed = seed;
    void this.render();
  }

  getSeed(): number {
    return this.currentSeed;
  }

  rerollSeed() {
    this.currentSeed = Math.floor(Math.random() * 1_000_000) + 1;
    void this.render();
  }

  private onDocSaved(doc: vscode.TextDocument) {
    if (!this.currentDoc || doc.uri.toString() !== this.currentDoc.uri.toString()) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('webworkPreview');
    if (cfg.get<boolean>('autoRefreshOnSave', true)) {
      void this.render();
    }
  }

  private onDocChanged(e: vscode.TextDocumentChangeEvent) {
    if (
      !this.currentDoc ||
      e.document.uri.toString() !== this.currentDoc.uri.toString()
    ) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('webworkPreview');
    if (!cfg.get<boolean>('autoRefreshOnEdit', false)) {
      return;
    }
    const delay = cfg.get<number>('editDebounceMs', 600);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.render();
    }, delay);
  }

  private async render() {
    if (!this.currentDoc) return;

    // Coalesce overlapping render requests: if one is in flight, just remember
    // that another was requested and run once when the current one finishes.
    if (this.renderInFlight) {
      this.pendingRender = true;
      return;
    }
    this.renderInFlight = true;
    try {
      const source = this.currentDoc.getText();
      const seed = this.currentSeed;
      const filePath = this.currentDoc.uri.fsPath;

      this.postStatus(`Rendering seed ${seed}…`);

      const result = await this.client.render({
        problemSource: source,
        problemSeed: seed,
        outputformat: 'html',
        sourceFilePath: filePath,
        hideAnswerForms: true,
      });

      const html = wrapPreviewHtml({
        rendered: result.html,
        seed: result.seed,
        filename: this.shortName(this.currentDoc),
        error: result.error,
        darkMode: vscode.workspace
          .getConfiguration('webworkPreview')
          .get<boolean>('darkMode', false),
      });
      this.panel.webview.html = html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.webview.html = wrapErrorHtml(msg, this.currentSeed);
    } finally {
      this.renderInFlight = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        void this.render();
      }
    }
  }

  private postStatus(text: string) {
    // Status bar update; cheap and avoids replacing the whole webview content
    // while a render is in flight.
    void this.panel.webview.postMessage({ type: 'status', text });
  }

  private onMessage(msg: { type?: string; seed?: number }) {
    if (msg?.type === 'reroll') {
      this.rerollSeed();
    } else if (msg?.type === 'setSeed' && typeof msg.seed === 'number') {
      this.setSeed(msg.seed);
    }
  }

  private shortName(doc: vscode.TextDocument): string {
    const parts = doc.uri.path.split('/');
    return parts[parts.length - 1] || doc.uri.toString();
  }

  dispose() {
    PreviewPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}