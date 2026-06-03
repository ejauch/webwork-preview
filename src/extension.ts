// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Erich (Westminster College)
// This file is part of WeBWorK Preview. See LICENSE for the full text.

import * as vscode from 'vscode';
import { RendererClient } from './renderer-client';
import { PreviewPanel } from './preview-panel';
import { SeedGridPanel } from './seed-grid';

let client: RendererClient;

export function activate(context: vscode.ExtensionContext) {
  const cfg = () => vscode.workspace.getConfiguration('webworkPreview');
  client = new RendererClient(cfg().get<string>('rendererUrl', 'http://localhost:3000'));

  // Keep the client URL in sync if the user changes settings.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('webworkPreview.rendererUrl')) {
        client.setBaseUrl(cfg().get<string>('rendererUrl', 'http://localhost:3000'));
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('webwork-preview.showPreview', () => {
      const doc = requirePgDocument();
      if (doc) PreviewPanel.show(context, client, doc, false);
    }),

    vscode.commands.registerCommand('webwork-preview.showPreviewToSide', () => {
      const doc = requirePgDocument();
      if (doc) PreviewPanel.show(context, client, doc, true);
    }),

    vscode.commands.registerCommand('webwork-preview.rerollSeed', () => {
      const doc = requirePgDocument();
      if (!doc) return;
      const panel = PreviewPanel.show(context, client, doc, true);
      panel.rerollSeed();
    }),

    vscode.commands.registerCommand('webwork-preview.setSeed', async () => {
      const doc = requirePgDocument();
      if (!doc) return;
      const input = await vscode.window.showInputBox({
        prompt: 'Problem seed',
        placeHolder: 'e.g. 1234',
        validateInput: (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 0 ? null : 'Enter a non-negative integer';
        },
      });
      if (input === undefined) return;
      const panel = PreviewPanel.show(context, client, doc, true);
      panel.setSeed(Number(input));
    }),

    vscode.commands.registerCommand('webwork-preview.showSeedGrid', () => {
      const doc = requirePgDocument();
      if (doc) SeedGridPanel.show(context, client, doc);
    }),

    vscode.commands.registerCommand('webwork-preview.checkRenderer', async () => {
      const url = cfg().get<string>('rendererUrl', 'http://localhost:3000');
      const ok = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pinging renderer at ${url}…`,
        },
        () => client.ping(3000),
      );
      if (ok) {
        vscode.window.showInformationMessage(`Renderer reachable at ${url}.`);
      } else {
        vscode.window.showErrorMessage(
          `Could not reach renderer at ${url}. Is the container running? See README for setup.`,
        );
      }
    }),
  );
}

export function deactivate() {}

function requirePgDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a .pg file first.');
    return undefined;
  }
  const doc = editor.document;
  if (!doc.fileName.endsWith('.pg') && doc.languageId !== 'pg') {
    vscode.window.showWarningMessage('The active editor is not a .pg file.');
    return undefined;
  }
  return doc;
}