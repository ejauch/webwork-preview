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
exports.RendererClient = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
class RendererClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    setBaseUrl(url) {
        this.baseUrl = url;
    }
    /**
     * Quick health check — hits the renderer's root and returns true if it answers.
     * The PG renderer (Mojolicious-based) serves a basic page at / when running.
     */
    async ping(timeoutMs = 2000) {
        try {
            await this.request('GET', '/', undefined, timeoutMs);
            return true;
        }
        catch {
            return false;
        }
    }
    async render(req) {
        const form = new URLSearchParams();
        form.set('problemSource', req.problemSource);
        form.set('problemSeed', String(req.problemSeed));
        form.set('outputformat', req.outputformat ?? 'html');
        form.set('format', req.outputformat ?? 'html');
        form.set('language', 'en');
        form.set('showSummary', '0');
        form.set('showAnswerNumbers', '0');
        form.set('hidePreviewButton', req.hideAnswerForms ? '1' : '0');
        form.set('hideCheckAnswersButton', req.hideAnswerForms ? '1' : '0');
        form.set('hideSubmitButton', req.hideAnswerForms ? '1' : '0');
        if (req.sourceFilePath) {
            form.set('sourceFilePath', req.sourceFilePath);
        }
        if (req.showCorrectAnswers) {
            form.set('showCorrectAnswers', '1');
        }
        const body = form.toString();
        const response = await this.request('POST', '/render-api', {
            body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body).toString(),
                Accept: 'text/html, application/json',
            },
        }, 30000);
        return this.parseResponse(response, req.problemSeed);
    }
    parseResponse(raw, seed) {
        // The renderer may return JSON (with renderedHTML inside) or raw HTML
        // depending on negotiation. Handle both.
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                const html = parsed.renderedHTML ??
                    parsed.html ??
                    parsed.problem_result?.html ??
                    '';
                const err = parsed.flags?.error ??
                    parsed.errors ??
                    parsed.error_message ??
                    undefined;
                return {
                    html: typeof html === 'string' ? html : JSON.stringify(parsed, null, 2),
                    error: err && String(err).length > 0 ? String(err) : undefined,
                    seed,
                };
            }
            catch {
                // fall through and treat as HTML
            }
        }
        // Heuristic: if the body contains "ERROR caught by Translator" the render failed.
        const errMatch = raw.match(/ERROR\s+caught\s+by\s+Translator[\s\S]*?(?=<\/div>|<\/pre>|$)/i);
        return {
            html: raw,
            error: errMatch ? errMatch[0].slice(0, 2000) : undefined,
            seed,
        };
    }
    request(method, path, opts, timeoutMs) {
        return new Promise((resolve, reject) => {
            let url;
            try {
                url = new url_1.URL(path, this.baseUrl);
            }
            catch (e) {
                return reject(new Error(`Invalid renderer URL: ${this.baseUrl}`));
            }
            const lib = url.protocol === 'https:' ? https : http;
            const reqOpts = {
                method,
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                headers: opts?.headers ?? {},
            };
            const req = lib.request(reqOpts, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`Renderer returned HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
                    }
                    else {
                        resolve(text);
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Renderer request timed out after ${timeoutMs}ms`));
            });
            if (opts?.body) {
                req.write(opts.body);
            }
            req.end();
        });
    }
}
exports.RendererClient = RendererClient;
//# sourceMappingURL=renderer-client.js.map