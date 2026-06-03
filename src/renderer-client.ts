// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Erich (Westminster College)
// This file is part of WeBWorK Preview. See LICENSE for the full text.

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface RenderRequest {
  problemSource: string;
  problemSeed: number;
  /** Format the renderer returns. 'html' is what we want for direct display. */
  outputformat?: 'html' | 'json' | 'static';
  /** Optional: path used by the renderer for resolving relative includes. */
  sourceFilePath?: string;
  /** Show/hide answer fields and check buttons. We hide them since we only want preview. */
  showCorrectAnswers?: boolean;
  /** Hide the submit/preview/check buttons in the rendered output. */
  hideAnswerForms?: boolean;
}

export interface RenderResult {
  /** Full HTML payload returned by the renderer (when outputformat=html). */
  html: string;
  /** Any error message extracted from the payload, if rendering failed. */
  error?: string;
  /** Seed used (echoed back for convenience). */
  seed: number;
}

export class RendererClient {
  constructor(private baseUrl: string) {}

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Quick health check — hits the renderer's root and returns true if it answers.
   * The PG renderer (Mojolicious-based) serves a basic page at / when running.
   */
  async ping(timeoutMs = 2000): Promise<boolean> {
    try {
      await this.request('GET', '/', undefined, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  async render(req: RenderRequest): Promise<RenderResult> {
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
    const response = await this.request(
      'POST',
      '/render-api',
      {
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
          Accept: 'text/html, application/json',
        },
      },
      30000,
    );

    return this.parseResponse(response, req.problemSeed);
  }

  private parseResponse(raw: string, seed: number): RenderResult {
    // The renderer may return JSON (with renderedHTML inside) or raw HTML
    // depending on negotiation. Handle both.
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const html =
          parsed.renderedHTML ??
          parsed.html ??
          parsed.problem_result?.html ??
          '';
        const err =
          parsed.flags?.error ??
          parsed.errors ??
          parsed.error_message ??
          undefined;
        return {
          html: typeof html === 'string' ? html : JSON.stringify(parsed, null, 2),
          error: err && String(err).length > 0 ? String(err) : undefined,
          seed,
        };
      } catch {
        // fall through and treat as HTML
      }
    }
    // Heuristic: if the body contains "ERROR caught by Translator" the render failed.
    const errMatch = raw.match(
      /ERROR\s+caught\s+by\s+Translator[\s\S]*?(?=<\/div>|<\/pre>|$)/i,
    );
    return {
      html: raw,
      error: errMatch ? errMatch[0].slice(0, 2000) : undefined,
      seed,
    };
  }

  private request(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: string; headers?: Record<string, string> } | undefined,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(path, this.baseUrl);
      } catch (e) {
        return reject(new Error(`Invalid renderer URL: ${this.baseUrl}`));
      }
      const lib = url.protocol === 'https:' ? https : http;
      const reqOpts: http.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: opts?.headers ?? {},
      };

      const req = lib.request(reqOpts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Renderer returned HTTP ${res.statusCode}: ${text.slice(0, 500)}`,
              ),
            );
          } else {
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