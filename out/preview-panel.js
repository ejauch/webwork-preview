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
exports.PreviewPanel = void 0;
const vscode = __importStar(require("vscode"));
const html_wrapper_1 = require("./html-wrapper");
/**
 * Manages a single preview webview tied to one .pg document.
 * Only one preview panel exists at a time; switching documents updates the content.
 */
class PreviewPanel {
    static show(context, client, doc, toSide) {
        const column = toSide
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.Active;
        if (PreviewPanel.current) {
            PreviewPanel.current.panel.reveal(column, true);
            PreviewPanel.current.setDocument(doc);
            return PreviewPanel.current;
        }
        const panel = vscode.window.createWebviewPanel('webworkPreview', 'WeBWorK Preview', { viewColumn: column, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri],
        });
        PreviewPanel.current = new PreviewPanel(context, client, panel, doc);
        return PreviewPanel.current;
    }
    constructor(context, client, panel, doc) {
        this.context = context;
        this.client = client;
        this.disposables = [];
        this.renderInFlight = false;
        this.pendingRender = false;
        this.panel = panel;
        const cfg = vscode.workspace.getConfiguration('webworkPreview');
        this.currentSeed = cfg.get('defaultSeed', 1234);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        // Wire up auto-refresh handlers.
        vscode.workspace.onDidSaveTextDocument((d) => this.onDocSaved(d), null, this.disposables);
        vscode.workspace.onDidChangeTextDocument((e) => this.onDocChanged(e), null, this.disposables);
        // Allow webview to send messages back (e.g. seed change buttons in the chrome).
        this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);
        // Re-render when settings that affect appearance change.
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('webworkPreview.darkMode')) {
                void this.render();
            }
        }, null, this.disposables);
        this.setDocument(doc);
    }
    setDocument(doc) {
        this.currentDoc = doc;
        this.panel.title = `WeBWorK Preview — ${this.shortName(doc)}`;
        void this.render();
    }
    setSeed(seed) {
        this.currentSeed = seed;
        void this.render();
    }
    getSeed() {
        return this.currentSeed;
    }
    rerollSeed() {
        this.currentSeed = Math.floor(Math.random() * 1000000) + 1;
        void this.render();
    }
    onDocSaved(doc) {
        if (!this.currentDoc || doc.uri.toString() !== this.currentDoc.uri.toString()) {
            return;
        }
        const cfg = vscode.workspace.getConfiguration('webworkPreview');
        if (cfg.get('autoRefreshOnSave', true)) {
            void this.render();
        }
    }
    onDocChanged(e) {
        if (!this.currentDoc ||
            e.document.uri.toString() !== this.currentDoc.uri.toString()) {
            return;
        }
        const cfg = vscode.workspace.getConfiguration('webworkPreview');
        if (!cfg.get('autoRefreshOnEdit', false)) {
            return;
        }
        const delay = cfg.get('editDebounceMs', 600);
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            void this.render();
        }, delay);
    }
    async render() {
        if (!this.currentDoc)
            return;
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
            const html = (0, html_wrapper_1.wrapPreviewHtml)({
                rendered: result.html,
                seed: result.seed,
                filename: this.shortName(this.currentDoc),
                error: result.error,
                darkMode: vscode.workspace
                    .getConfiguration('webworkPreview')
                    .get('darkMode', false),
            });
            this.panel.webview.html = html;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.panel.webview.html = (0, html_wrapper_1.wrapErrorHtml)(msg, this.currentSeed);
        }
        finally {
            this.renderInFlight = false;
            if (this.pendingRender) {
                this.pendingRender = false;
                void this.render();
            }
        }
    }
    postStatus(text) {
        // Status bar update; cheap and avoids replacing the whole webview content
        // while a render is in flight.
        void this.panel.webview.postMessage({ type: 'status', text });
    }
    onMessage(msg) {
        if (msg?.type === 'reroll') {
            this.rerollSeed();
        }
        else if (msg?.type === 'setSeed' && typeof msg.seed === 'number') {
            this.setSeed(msg.seed);
        }
    }
    shortName(doc) {
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
exports.PreviewPanel = PreviewPanel;
//# sourceMappingURL=preview-panel.js.map