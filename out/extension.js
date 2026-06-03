"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const renderer_client_1 = require("./renderer-client");
const preview_panel_1 = require("./preview-panel");
const seed_grid_1 = require("./seed-grid");
let client;
function activate(context) {
    const cfg = () => vscode.workspace.getConfiguration('webworkPreview');
    client = new renderer_client_1.RendererClient(cfg().get('rendererUrl', 'http://localhost:3000'));
    // Keep the client URL in sync if the user changes settings.
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('webworkPreview.rendererUrl')) {
            client.setBaseUrl(cfg().get('rendererUrl', 'http://localhost:3000'));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('webwork-preview.showPreview', () => {
        const doc = requirePgDocument();
        if (doc)
            preview_panel_1.PreviewPanel.show(context, client, doc, false);
    }), vscode.commands.registerCommand('webwork-preview.showPreviewToSide', () => {
        const doc = requirePgDocument();
        if (doc)
            preview_panel_1.PreviewPanel.show(context, client, doc, true);
    }), vscode.commands.registerCommand('webwork-preview.rerollSeed', () => {
        const doc = requirePgDocument();
        if (!doc)
            return;
        const panel = preview_panel_1.PreviewPanel.show(context, client, doc, true);
        panel.rerollSeed();
    }), vscode.commands.registerCommand('webwork-preview.setSeed', async () => {
        const doc = requirePgDocument();
        if (!doc)
            return;
        const input = await vscode.window.showInputBox({
            prompt: 'Problem seed',
            placeHolder: 'e.g. 1234',
            validateInput: (v) => {
                const n = Number(v);
                return Number.isInteger(n) && n >= 0 ? null : 'Enter a non-negative integer';
            },
        });
        if (input === undefined)
            return;
        const panel = preview_panel_1.PreviewPanel.show(context, client, doc, true);
        panel.setSeed(Number(input));
    }), vscode.commands.registerCommand('webwork-preview.showSeedGrid', () => {
        const doc = requirePgDocument();
        if (doc)
            seed_grid_1.SeedGridPanel.show(context, client, doc);
    }), vscode.commands.registerCommand('webwork-preview.checkRenderer', async () => {
        const url = cfg().get('rendererUrl', 'http://localhost:3000');
        const ok = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Pinging renderer at ${url}…`,
        }, () => client.ping(3000));
        if (ok) {
            vscode.window.showInformationMessage(`Renderer reachable at ${url}.`);
        }
        else {
            vscode.window.showErrorMessage(`Could not reach renderer at ${url}. Is the container running? See README for setup.`);
        }
    }));
}
function deactivate() { }
function requirePgDocument() {
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
//# sourceMappingURL=extension.js.map