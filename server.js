const cheerio = require("cheerio");
const express = require("express");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { fetchPage } = require("./lib/safe-fetch");

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

function safeWebUrl(value, baseUrl, fallback = "") {
  if (!value) return fallback;
  try {
    const parsed = new URL(value, baseUrl);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : fallback;
  } catch {
    return fallback;
  }
}

function metaContent($, selector) {
  return ($(selector).attr("content") || "").trim();
}

function renderAnalysis(html, targetUrl) {
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  const metaDescription = metaContent($, 'meta[name="description"]');
  const canonical = ($('link[rel="canonical"]').attr("href") || "").trim();
  const firstH1 = $("h1").first().text().trim();
  const lang = ($("html").attr("lang") || "").trim();
  const robots = metaContent($, 'meta[name="robots"]');
  const viewport = metaContent($, 'meta[name="viewport"]');

  const ogTitle = metaContent($, 'meta[property="og:title"]');
  const ogDescription = metaContent($, 'meta[property="og:description"]');
  const ogImage = safeWebUrl(
    metaContent($, 'meta[property="og:image"]'),
    targetUrl,
    PLACEHOLDER_IMAGE,
  );
  const ogUrl = safeWebUrl(
    metaContent($, 'meta[property="og:url"]'),
    targetUrl,
    targetUrl,
  );
  const twitterCard = metaContent($, 'meta[name="twitter:card"]');
  const twitterTitle = metaContent($, 'meta[name="twitter:title"]');
  const twitterDescription = metaContent(
    $,
    'meta[name="twitter:description"]',
  );
  const twitterImage = safeWebUrl(
    metaContent($, 'meta[name="twitter:image"]'),
    targetUrl,
    ogImage,
  );

  const seoChecks = [
    {
      name: "Title Tag",
      status: title ? "Found" : "Missing",
      suggestion: title
        ? title.length < 30 || title.length > 60
          ? "Title length should be between 30 and 60 characters."
          : "Looks good!"
        : "Add a <title> tag to the page.",
    },
    {
      name: "Meta Description",
      status: metaDescription ? "Found" : "Missing",
      suggestion: metaDescription
        ? metaDescription.length < 50 || metaDescription.length > 160
          ? "Meta description should be between 50 and 160 characters."
          : "Looks good!"
        : "Add a meta description for better SEO.",
    },
    {
      name: "Canonical Tag",
      status: canonical ? "Found" : "Missing",
      suggestion: canonical
        ? "Looks good!"
        : "Add a canonical tag to avoid duplicate content issues.",
    },
    {
      name: "H1 Tag",
      status: firstH1 ? "Found" : "Missing",
      suggestion: firstH1
        ? "Looks good!"
        : "Add at least one <h1> tag for the main heading.",
    },
    {
      name: "Language Attribute",
      status: lang ? `Found (${lang})` : "Missing",
      suggestion: lang
        ? "Looks good!"
        : 'Specify the language attribute in the <html> tag, e.g., <html lang="en">.',
    },
    {
      name: "Robots Meta Tag",
      status: robots ? "Found" : "Missing",
      suggestion: robots
        ? "Looks good!"
        : 'Add a robots meta tag, e.g., <meta name="robots" content="index,follow">.',
    },
    {
      name: "Viewport Meta Tag",
      status: viewport ? "Found" : "Missing",
      suggestion: viewport
        ? "Looks good!"
        : "Add a viewport meta tag to ensure mobile responsiveness.",
    },
    {
      name: "Open Graph Tags",
      status:
        ogTitle && ogDescription && ogImage && ogUrl ? "Complete" : "Incomplete",
      suggestion:
        ogTitle && ogDescription && ogImage && ogUrl
          ? "Looks good!"
          : "Ensure all required OG tags are present: og:title, og:description, og:image, and og:url.",
    },
    {
      name: "Twitter Card Tags",
      status:
        twitterCard && twitterTitle && twitterDescription && twitterImage
          ? "Complete"
          : "Incomplete",
      suggestion:
        twitterCard && twitterTitle && twitterDescription && twitterImage
          ? "Looks good!"
          : "Consider adding Twitter Card tags for better social sharing.",
    },
  ];

  const seoAuditRows = seoChecks
    .map(
      (check) => {
        const isReady = check.suggestion === "Looks good!";
        const displayStatus =
          !isReady && check.status.startsWith("Found")
            ? "Review"
            : check.status;
        return `
          <article class="audit-item">
            <div class="audit-item__topline">
              <h3>${escapeHtml(check.name)}</h3>
              <span class="status status--${isReady ? "pass" : "attention"}">
                <span aria-hidden="true">${isReady ? "✓" : "!"}</span>
                ${escapeHtml(displayStatus)}
              </span>
            </div>
            <p>${escapeHtml(check.suggestion)}</p>
          </article>`;
      },
    )
    .join("");

  const readyCount = seoChecks.filter(
    (check) => check.suggestion === "Looks good!",
  ).length;
  const opportunityCount = seoChecks.length - readyCount;

  const metaTags = {};
  $("meta").each((_index, element) => {
    const property = $(element).attr("property");
    const name = $(element).attr("name");
    const value = $(element).attr("content");
    if (!value) return;
    if (property?.startsWith("og:") || property?.startsWith("twitter:")) {
      metaTags[property] = value;
    }
    if (name?.startsWith("og:") || name?.startsWith("twitter:")) {
      metaTags[name] = value;
    }
  });

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
          <h2 id="results-title">${readyCount} of ${seoChecks.length} checks ready</h2>
          <p>${
            opportunityCount
              ? `${opportunityCount} ${opportunityCount === 1 ? "opportunity" : "opportunities"} to improve before publishing.`
              : "Everything in this quick audit looks ready to share."
          }</p>
          <a class="source-link" href="${safeOgUrl}" target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">↗</span> ${safeOgUrl}
          </a>
        </div>
        <div class="score" aria-label="${readyCount} of ${seoChecks.length} checks ready">
          <strong>${readyCount}</strong>
          <span>/ ${seoChecks.length}</span>
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
            <p class="search-result__url">${safeOgUrl}</p>
            <h3>${previewTitle}</h3>
            <p>${previewDescription}</p>
          </div>
        </article>

        <article class="social-preview social-preview--facebook surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--facebook" aria-hidden="true">f</span>
            <div><strong>Facebook</strong><span>Open Graph preview</span></div>
          </div>
          <div class="social-card">
            <img src="${safeOgImage}" alt="Facebook link preview image">
            <div class="social-card__body">
              <span>${safeOgUrl}</span>
              <h3>${facebookTitle}</h3>
              <p>${facebookDescription}</p>
            </div>
          </div>
        </article>

        <article class="social-preview social-preview--x surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--x" aria-hidden="true">𝕏</span>
            <div><strong>X / Twitter</strong><span>Summary card</span></div>
          </div>
          <div class="social-card social-card--dark">
            <img src="${safeTwitterImage}" alt="X link preview image">
            <div class="social-card__body">
              <span>${safeOgUrl}</span>
              <h3>${escapeHtml(twitterTitle || ogTitle || "No Title")}</h3>
              <p>${escapeHtml(twitterDescription || ogDescription || "No Description")}</p>
            </div>
          </div>
        </article>

        <article class="social-preview social-preview--linkedin surface">
          <div class="preview-label">
            <span class="preview-icon preview-icon--linkedin" aria-hidden="true">in</span>
            <div><strong>LinkedIn</strong><span>Open Graph preview</span></div>
          </div>
          <div class="social-card">
            <img src="${safeOgImage}" alt="LinkedIn link preview image">
            <div class="social-card__body">
              <h3>${facebookTitle}</h3>
              <span>${safeOgUrl}</span>
            </div>
          </div>
        </article>
      </div>

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
          imgSrc: ["'self'", "data:", "http:", "https:"],
          scriptSrc: ["'none'"],
          styleSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.static(path.join(__dirname, "public")));

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
      const form = `
        <form method="GET" action="/" class="analyzer-panel surface">
          <div class="analyzer-panel__header">
            <span class="analyzer-panel__icon" aria-hidden="true">{ }</span>
            <div>
              <h2>Analyze a webpage</h2>
              <p>Fetch and inspect the rendered metadata.</p>
            </div>
          </div>
          <label for="url">Enter a public page URL</label>
          <div class="url-field">
            <span class="request-method">GET</span>
            <input id="url" type="url" name="url" placeholder="https://example.com" value="${escapeHtml(requestedUrl)}" autocomplete="url" inputmode="url" required>
          </div>
          <button class="primary-button" type="submit">
            Run free audit <span aria-hidden="true">→</span>
          </button>
          <p class="form-note"><span aria-hidden="true">$</span> public HTML only · 2 MB max · 10s timeout</p>
        </form>`;

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
          content = renderAnalysis(html, requestedUrl);
        } catch (error) {
          const isPublicError = Number.isInteger(error.statusCode);
          res.status(isPublicError ? error.statusCode : 502);
          content = `
            <section class="error-card surface" role="alert">
              <span class="error-card__icon" aria-hidden="true">!</span>
              <div>
                <p class="eyebrow">Analysis could not be completed</p>
                <h2>We could not inspect that page</h2>
                <p>${escapeHtml(
                isPublicError
                  ? error.message
                  : "The target website could not be analyzed.",
                )}</p>
                <p class="error-card__hint">Check that the URL is public, returns HTML, and is available without signing in.</p>
              </div>
            </section>`;
        }
      }

      res.type("html").send(renderPage(form, content));
    },
  );

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
