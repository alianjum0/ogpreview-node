const express = require("express");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { analyzeDocument, analyzeHtml } = require("./lib/analyze");
const { fetchImage, inspectImage } = require("./lib/image-inspector");
const { safeWebUrl } = require("./lib/metadata");
const { fetchPage, normalizeTargetUrl } = require("./lib/safe-fetch");
const { generateTags } = require("./public/tag-generator");

const PLACEHOLDER_IMAGE = "/preview-placeholder.svg";

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function imagePreviewUrl(report, fallback = PLACEHOLDER_IMAGE) {
  return report?.reachable && report.url
    ? `/preview-image?url=${encodeURIComponent(report.url)}`
    : fallback;
}

function renderImageReport(label, report) {
  if (!report) return "";
  if (!report.reachable) {
    return `<article class="image-report image-report--error"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(report.error || "Image unavailable")}</span></article>`;
  }
  return `<article class="image-report">
    <strong>${escapeHtml(label)}</strong>
    <span>${report.width} × ${report.height}</span>
    <span>${Math.round(report.bytes / 1000)} KB</span>
    <span>${escapeHtml(report.contentType)}</span>
    <span>${report.aspectRatio}:1</span>
    <span>${report.https ? "HTTPS" : "HTTP warning"}</span>
    <span>${report.recommendedDimensions ? "Recommended dimensions" : "Consider 1200 × 630"}</span>
  </article>`;
}

function renderEditor(metadata) {
  const draft = {
    title: metadata.title,
    description: metadata.description,
    canonical: metadata.canonical.url || metadata.canonical.raw,
    ogTitle: metadata.openGraph.title,
    ogDescription: metadata.openGraph.description,
    ogImage: metadata.openGraph.image.url || metadata.openGraph.image.raw,
    ogUrl: metadata.openGraph.url.url || metadata.openGraph.url.raw,
    twitterCard: metadata.twitter.card,
    twitterTitle: metadata.twitter.title,
    twitterDescription: metadata.twitter.description,
    twitterImage: metadata.twitter.image.url || metadata.twitter.image.raw,
  };
  const field = (name, label, type = "text") => `
    <label>${escapeHtml(label)}
      <input type="${type}" name="${name}" value="${escapeHtml(draft[name])}">
    </label>`;

  return `<section class="metadata-editor surface" data-metadata-editor>
    <div class="metadata-editor__heading">
      <div><p class="eyebrow">Draft metadata</p><h2>Edit and preview changes</h2></div>
      <p>The audit above reflects the fetched source. Draft edits update previews and generated tags only.</p>
    </div>
    <form class="metadata-editor__form">
      ${field("title", "Title")}
      ${field("description", "Meta description")}
      ${field("canonical", "Canonical URL", "url")}
      ${field("ogTitle", "Open Graph title")}
      ${field("ogDescription", "Open Graph description")}
      ${field("ogImage", "Open Graph image", "url")}
      ${field("ogUrl", "Open Graph URL", "url")}
      ${field("twitterCard", "Twitter card")}
      ${field("twitterTitle", "Twitter title")}
      ${field("twitterDescription", "Twitter description")}
      ${field("twitterImage", "Twitter image", "url")}
      <div class="metadata-editor__actions">
        <button type="reset" class="secondary-button">Reset detected values</button>
        <button type="button" class="primary-button" data-copy-tags>Copy tags</button>
        <span role="status" aria-live="polite" data-copy-status></span>
      </div>
      <label class="generated-tags">Generated &lt;head&gt; tags
        <textarea rows="12" readonly data-generated-tags>${escapeHtml(generateTags(draft))}</textarea>
      </label>
    </form>
  </section>`;
}

function renderAnalysis(htmlOrAnalysis, targetUrl) {
  const analysis = typeof htmlOrAnalysis === "string"
    ? analyzeHtml(htmlOrAnalysis, targetUrl)
    : htmlOrAnalysis;
  const { metadata, checks, score } = analysis;
  const title = metadata.title;
  const metaDescription = metadata.description;
  const ogTitle = metadata.openGraph.title;
  const ogDescription = metadata.openGraph.description;
  const ogImage = imagePreviewUrl(analysis.images?.openGraph);
  const ogUrl = metadata.openGraph.url.url || analysis.source.finalUrl || targetUrl || "";
  const twitterTitle = metadata.twitter.title;
  const twitterDescription = metadata.twitter.description;
  const twitterReport = analysis.images?.twitter || analysis.images?.openGraph;
  const twitterImage = imagePreviewUrl(twitterReport, ogImage);
  const checkNames = {
    title: "Title",
    description: "Meta description",
    canonical: "Canonical URL",
    "canonical-target": "Canonical target",
    h1: "Primary heading",
    language: "Language attribute",
    viewport: "Viewport metadata",
    "robots-noindex": "Search indexing",
    "robots-nofollow": "Link crawling",
    "og-title": "Open Graph title",
    "og-description": "Open Graph description",
    "og-image": "Open Graph image",
    "og-url": "Open Graph URL",
    "og-url-canonical": "Open Graph URL consistency",
    "og-title-consistency": "Open Graph title consistency",
    "og-description-consistency": "Open Graph description consistency",
    "twitter-card": "Twitter card",
    "twitter-title": "Twitter title",
    "twitter-description": "Twitter description",
    "twitter-image": "Twitter image",
  };

  const seoAuditRows = checks
    .map(
      (check) => {
        const isReady = check.status === "pass";
        const icon = isReady ? "✓" : check.status === "error" ? "×" : check.status === "info" ? "i" : "!";
        return `
          <article class="audit-item">
            <div class="audit-item__topline">
              <h3>${escapeHtml(checkNames[check.id] || check.id)}</h3>
              <span class="status status--${escapeHtml(check.status)}">
                <span aria-hidden="true">${icon}</span>
                ${escapeHtml(check.status)}
              </span>
            </div>
            <p>${escapeHtml(check.message)}</p>
            ${check.evidence ? `<small>${escapeHtml(check.evidence)}</small>` : ""}
          </article>`;
      },
    )
    .join("");
  const metaTags = metadata.socialTags;

  const metaRows = Object.entries(metaTags)
    .map(
      ([key, value]) => `
        <tr>
          <th scope="row"><code>${escapeHtml(key)}</code></th>
          <td>${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  const previewTitle = escapeHtml(ogTitle || title || "No Title Found");
  const previewDescription = escapeHtml(
    ogDescription || metaDescription || "No Description Found",
  );
  const facebookTitle = escapeHtml(ogTitle || "No Title");
  const facebookDescription = escapeHtml(ogDescription || "No Description");
  const safeOgImage = escapeHtml(ogImage);
  const safeTwitterImage = escapeHtml(twitterImage);
  const safeOgUrl = escapeHtml(ogUrl);

  return `
    <section class="results" aria-labelledby="results-title">
      <div class="results-summary surface">
        <div>
          <p class="eyebrow">Audit results</p>
          <h2 id="results-title">${score.value}/100 metadata score</h2>
          <p>${score.errors} errors · ${score.warnings} warnings · ${score.passed} passed</p>
          <a class="source-link" href="${safeOgUrl}" target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">↗</span> ${safeOgUrl}
          </a>
        </div>
        <div class="score" aria-label="Metadata score ${score.value} out of 100">
          <strong>${score.value}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <div class="section-heading">
        <div>
          <p class="eyebrow">SEO essentials</p>
          <h2>What is working and what to fix</h2>
        </div>
        <p>Focused checks for the metadata that shapes search visibility and link previews.</p>
      </div>
      <div class="audit-grid">${seoAuditRows}</div>

      ${renderEditor(metadata)}

      <div class="section-heading">
        <div>
          <p class="eyebrow">Live preview</p>
          <h2>See what your visitors will see</h2>
        </div>
        <p>Previews are approximations. Each platform can crop images and text differently.</p>
      </div>

      <div class="preview-layout">
        <article class="search-preview surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--search" aria-hidden="true">G</span>
            <div><strong>Search result preview</strong><span>Desktop result</span></div>
          </div>
          <div class="search-result">
            <p class="search-result__url" data-preview="url">${safeOgUrl}</p>
            <h3 data-preview="search-title">${previewTitle}</h3>
            <p data-preview="search-description">${previewDescription}</p>
          </div>
        </article>

        <article class="social-preview social-preview--facebook surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--facebook" aria-hidden="true">f</span>
            <div><strong>Facebook</strong><span>Open Graph preview</span></div>
          </div>
          <div class="social-card">
            <img src="${safeOgImage}" data-preview-image="og" alt="Facebook link preview image">
            <div class="social-card__body">
              <span data-preview="url">${safeOgUrl}</span>
              <h3 data-preview="og-title">${facebookTitle}</h3>
              <p data-preview="og-description">${facebookDescription}</p>
            </div>
          </div>
        </article>

        <article class="social-preview social-preview--x surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--x" aria-hidden="true">𝕏</span>
            <div><strong>X / Twitter</strong><span>Summary card</span></div>
          </div>
          <div class="social-card social-card--dark">
            <img src="${safeTwitterImage}" data-preview-image="twitter" alt="X link preview image">
            <div class="social-card__body">
              <span data-preview="url">${safeOgUrl}</span>
              <h3 data-preview="twitter-title">${escapeHtml(twitterTitle || ogTitle || "No Title")}</h3>
              <p data-preview="twitter-description">${escapeHtml(twitterDescription || ogDescription || "No Description")}</p>
            </div>
          </div>
        </article>

        <article class="social-preview social-preview--linkedin surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--linkedin" aria-hidden="true">in</span>
            <div><strong>LinkedIn</strong><span>Open Graph preview</span></div>
          </div>
          <div class="social-card">
            <img src="${safeOgImage}" data-preview-image="og" alt="LinkedIn link preview image">
            <div class="social-card__body">
              <h3 data-preview="og-title">${facebookTitle}</h3>
              <span data-preview="url">${safeOgUrl}</span>
            </div>
          </div>
        </article>
      </div>

      ${analysis.images ? `<div class="image-reports surface" aria-label="Social image validation">
        ${renderImageReport("Open Graph image", analysis.images.openGraph)}
        ${renderImageReport("Twitter image", analysis.images.twitter)}
      </div>` : ""}

      <details class="metadata surface">
        <summary>
          <span><strong>Raw social metadata</strong><small>${Object.keys(metaTags).length} tags discovered</small></span>
          <span class="details-action">View tags <span aria-hidden="true">⌄</span></span>
        </summary>
        <div class="metadata__table-wrap">
          <table>
            <thead><tr><th scope="col">Tag</th><th scope="col">Content</th></tr></thead>
            <tbody>${metaRows || '<tr><td colspan="2">No Open Graph or Twitter tags were found.</td></tr>'}</tbody>
          </table>
        </div>
      </details>
    </section>`;
}

function renderAnalyzerForm({
  activeMode = "url",
  baseUrl = "",
  pastedHtml = "",
  requestedUrl = "",
} = {}) {
  return `
    <div class="analyzer-panel surface" data-active-input="${escapeHtml(activeMode)}">
      <div class="analyzer-panel__header">
        <span class="analyzer-panel__icon" aria-hidden="true">{ }</span>
        <div>
          <h2>Analyze metadata</h2>
          <p>Inspect a public URL or paste HTML directly.</p>
        </div>
      </div>
      <div class="input-tabs" role="tablist" aria-label="Analysis input">
        <button type="button" role="tab" data-input-mode="url" aria-selected="${activeMode === "url"}">URL</button>
        <button type="button" role="tab" data-input-mode="html" aria-selected="${activeMode === "html"}">HTML</button>
      </div>
      <form method="GET" action="/" class="analyzer-form" data-input-panel="url"${activeMode === "url" ? "" : " hidden"}>
        <label for="url">Enter a public page URL</label>
        <div class="url-field">
          <span class="request-method">GET</span>
          <input id="url" type="url" name="url" placeholder="https://example.com" value="${escapeHtml(requestedUrl)}" autocomplete="url" inputmode="url" required>
        </div>
        <button class="primary-button" type="submit">Run free audit <span aria-hidden="true">→</span></button>
        <p class="form-note"><span aria-hidden="true">$</span> public HTML only · 2 MB max · 10s timeout</p>
      </form>
      <form method="POST" action="/analyze/html" class="analyzer-form" data-input-panel="html"${activeMode === "html" ? "" : " hidden"}>
        <label for="base-url">Base URL <span>(optional)</span></label>
        <div class="url-field">
          <span class="request-method">BASE</span>
          <input id="base-url" type="url" name="baseUrl" placeholder="https://example.com/page" value="${escapeHtml(baseUrl)}" autocomplete="url" inputmode="url">
        </div>
        <label for="html">Paste page HTML or a &lt;head&gt; element</label>
        <textarea id="html" name="html" rows="8" maxlength="262144" required>${escapeHtml(pastedHtml)}</textarea>
        <button class="primary-button" type="submit">Analyze pasted HTML <span aria-hidden="true">→</span></button>
        <p class="form-note"><span aria-hidden="true">$</span> processed in memory · 256 KB max · no page fetch</p>
      </form>
    </div>`;
}

function renderError(error, fallbackMessage = "The target website could not be analyzed.") {
  const isPublicError = Number.isInteger(error.statusCode);
  return `
    <section class="error-card surface" role="alert">
      <span class="error-card__icon" aria-hidden="true">!</span>
      <div>
        <p class="eyebrow">Analysis could not be completed</p>
        <h2>We could not inspect that page</h2>
        <p>${escapeHtml(isPublicError ? error.message : fallbackMessage)}</p>
        <p class="error-card__hint">Check the input and try again.</p>
      </div>
    </section>`;
}

function renderPage(form, content) {
  return `<!DOCTYPE html>
    <html lang="en" data-theme="light">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="description" content="Audit SEO metadata and preview how any public webpage appears when shared.">
      <meta name="theme-color" content="#f7f7fb">
      <title>MetaScope — SEO Audit & Social Preview</title>
      <link href="/styles.css?v=2" rel="stylesheet">
      <script src="/tag-generator.js" defer></script>
      <script src="/app.js" defer></script>
    </head>
    <body>
      <header class="site-header shell">
        <a class="brand" href="/" aria-label="MetaScope home">
          <span class="brand__mark" aria-hidden="true"><span></span></span>
          <span class="brand__name">MetaScope</span>
          <span class="brand__descriptor">Metadata debugger</span>
        </a>
      </header>
      <main>
        <section class="hero shell">
          <div class="hero__copy">
            <p class="eyebrow"><span aria-hidden="true">~/</span> SEO + social metadata inspector</p>
            <h1 aria-label="Preview how your page appears before you share it.">Preview how your page appears <em>before you share it.</em></h1>
            <p class="hero__lede">Audit essential SEO tags and see realistic search and social previews in one focused report.</p>
            <ul class="trust-list" aria-label="Project benefits">
              <li><span aria-hidden="true">01</span> No signup. No API key.</li>
              <li><span aria-hidden="true">02</span> SSRF-protected requests</li>
              <li><span aria-hidden="true">03</span> Server-rendered results</li>
            </ul>
          </div>
          ${form}
        </section>
        <div class="shell">${content}</div>
      </main>
      <footer class="site-footer shell">
        <div><span class="brand__mark brand__mark--small" aria-hidden="true"><span></span></span><strong>MetaScope</strong></div>
        <p>Built with Node.js, Express, Cheerio, and careful URL handling.</p>
      </footer>
    </body>
    </html>`;
}

function createApp({
  pageFetcher = fetchPage,
  imageFetcher = fetchImage,
  imageInspector = inspectImage,
  rateLimitOptions = {},
  trustProxy = false,
} = {}) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.static(path.join(__dirname, "public")));
  const parseHtmlForm = express.urlencoded({ extended: false, limit: "256kb" });

  const analysisLimiter = rateLimit({
    legacyHeaders: false,
    limit: 30,
    message: "Too many analysis requests. Please try again later.",
    standardHeaders: "draft-8",
    windowMs: 15 * 60 * 1000,
    ...rateLimitOptions,
  });

  app.get(
    "/",
    (req, res, next) =>
      req.query.url ? analysisLimiter(req, res, next) : next(),
    async (req, res) => {
      const requestedUrl = typeof req.query.url === "string" ? req.query.url : "";
      const form = renderAnalyzerForm({ requestedUrl });

      let content = `
        <section class="feature-grid" aria-label="What MetaScope checks">
          <article>
            <span class="feature-icon feature-icon--violet" aria-hidden="true">01</span>
            <h2>Audit SEO essentials</h2>
            <p>Check titles, descriptions, headings, canonical URLs, language, and crawl settings.</p>
          </article>
          <article>
            <span class="feature-icon feature-icon--blue" aria-hidden="true">02</span>
            <h2>Preview every share</h2>
            <p>See how your page can appear across search, Facebook, X, and LinkedIn.</p>
          </article>
          <article>
            <span class="feature-icon feature-icon--green" aria-hidden="true">03</span>
            <h2>Spot fixes quickly</h2>
            <p>Scan clear pass states and practical opportunities without digging through source.</p>
          </article>
        </section>`;

      if (requestedUrl) {
        try {
          const html = await pageFetcher(requestedUrl);
          const analysis = await analyzeDocument(html, requestedUrl, { imageInspector, mode: "url" });
          content = renderAnalysis(analysis);
        } catch (error) {
          const isPublicError = Number.isInteger(error.statusCode);
          res.status(isPublicError ? error.statusCode : 502);
          content = renderError(error);
        }
      }

      res.type("html").send(renderPage(form, content));
    },
  );

  app.post("/analyze/html", analysisLimiter, parseHtmlForm, async (req, res) => {
    const pastedHtml = typeof req.body.html === "string" ? req.body.html : "";
    const suppliedBaseUrl = typeof req.body.baseUrl === "string" ? req.body.baseUrl.trim() : "";
    const form = renderAnalyzerForm({
      activeMode: "html",
      baseUrl: suppliedBaseUrl,
      pastedHtml,
    });

    try {
      if (!pastedHtml.trim()) {
        const error = new Error("Paste HTML to analyze.");
        error.statusCode = 400;
        throw error;
      }
      const baseUrl = suppliedBaseUrl ? normalizeTargetUrl(suppliedBaseUrl) : "";
      const analysis = await analyzeDocument(pastedHtml, baseUrl, { imageInspector });
      res.type("html").send(renderPage(form, renderAnalysis(analysis)));
    } catch (error) {
      const isPublicError = Number.isInteger(error.statusCode);
      res.status(isPublicError ? error.statusCode : 400);
      res.type("html").send(renderPage(form, renderError(error, "The pasted HTML could not be analyzed.")));
    }
  });

  app.get("/preview-image", analysisLimiter, async (req, res) => {
    try {
      const requestedUrl = typeof req.query.url === "string" ? req.query.url : "";
      const image = await imageFetcher(requestedUrl);
      res.set("Cache-Control", "private, max-age=300");
      res.type(image.contentType).send(image.buffer);
    } catch (error) {
      const isPublicError = Number.isInteger(error.statusCode);
      res.status(isPublicError ? error.statusCode : 502).type("text").send(
        isPublicError ? error.message : "The image could not be loaded.",
      );
    }
  });

  app.use((error, req, res, next) => {
    if (error?.type !== "entity.too.large") return next(error);
    const publicError = new Error("Pasted HTML must be 256 KB or smaller.");
    publicError.statusCode = 413;
    res
      .status(413)
      .type("html")
      .send(renderPage(renderAnalyzerForm({ activeMode: "html" }), renderError(publicError)));
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3001;
  const trustProxy = /^\d+$/.test(process.env.TRUST_PROXY_HOPS || "")
    ? Number(process.env.TRUST_PROXY_HOPS)
    : false;
  createApp({ trustProxy }).listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

module.exports = { createApp, escapeHtml, renderAnalysis, safeWebUrl };
