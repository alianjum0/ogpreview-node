const cheerio = require("cheerio");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { fetchPage } = require("./lib/safe-fetch");

const PLACEHOLDER_IMAGE = "https://placehold.co/600x315?text=No+Image";

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
      (check) => `
        <tr>
          <td>${escapeHtml(check.name)}</td>
          <td>${escapeHtml(check.status)}</td>
          <td>${escapeHtml(check.suggestion)}</td>
        </tr>`,
    )
    .join("");

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
          <td>${escapeHtml(key)}</td>
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
    <h2 class="mb-3">SEO Audit</h2>
    <div class="table-responsive mb-5">
      <table class="table table-bordered">
        <thead class="table-light">
          <tr><th>SEO Element</th><th>Status</th><th>Suggestion</th></tr>
        </thead>
        <tbody>${seoAuditRows}</tbody>
      </table>
    </div>

    <h2 class="mb-3">Website Preview</h2>
    <div class="card mb-4">
      <img src="${safeOgImage}" class="card-img-top" alt="OG Image">
      <div class="card-body">
        <h5 class="card-title">${previewTitle}</h5>
        <p class="card-text">${previewDescription}</p>
        <a href="${safeOgUrl}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">${safeOgUrl}</a>
      </div>
    </div>

    <h2 class="mb-3">Social Media Previews</h2>
    <div class="row mb-4 g-3">
      <div class="col-md-4">
        <div class="card h-100">
          <img src="${safeOgImage}" class="card-img-top" alt="Facebook Preview">
          <div class="card-body">
            <h5 class="card-title">${facebookTitle}</h5>
            <p class="card-text">${facebookDescription}</p>
            <span class="badge bg-primary">Facebook</span>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <img src="${safeTwitterImage}" class="card-img-top" alt="Twitter Preview">
          <div class="card-body">
            <h5 class="card-title">${escapeHtml(twitterTitle || ogTitle || "No Title")}</h5>
            <p class="card-text">${escapeHtml(twitterDescription || ogDescription || "No Description")}</p>
            <span class="badge bg-info text-dark">Twitter</span>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <img src="${safeOgImage}" class="card-img-top" alt="TikTok Preview">
          <div class="card-body">
            <h5 class="card-title">${facebookTitle}</h5>
            <p class="card-text">${facebookDescription}</p>
            <span class="badge bg-dark">TikTok</span>
          </div>
        </div>
      </div>
    </div>

    <h2 class="mb-3">All OG/Twitter Meta Tags</h2>
    <div class="table-responsive mb-5">
      <table class="table table-striped">
        <thead class="table-light"><tr><th>Tag</th><th>Content</th></tr></thead>
        <tbody>${metaRows}</tbody>
      </table>
    </div>`;
}

function renderPage(content) {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="description" content="Audit SEO and social sharing metadata for any public webpage.">
      <title>SEO Audit & Social Preview</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <main class="container py-5">
        <div class="col-lg-10 col-xl-9 mx-auto mb-4">
          <h1>SEO Audit & Social Media Preview</h1>
          <p class="text-secondary">Inspect the SEO, Open Graph, and Twitter Card metadata of a public webpage.</p>
          ${content}
        </div>
      </main>
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
          styleSrc: ["'self'", "https://cdn.jsdelivr.net"],
        },
      },
    }),
  );

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
      let content = `
        <form method="GET" action="/" class="mb-5">
          <label for="url" class="form-label">Webpage URL</label>
          <div class="input-group">
            <input id="url" type="url" name="url" class="form-control" placeholder="https://example.com" value="${escapeHtml(requestedUrl)}" required>
            <button class="btn btn-primary" type="submit">Analyze</button>
          </div>
        </form>`;

      if (requestedUrl) {
        try {
          const html = await pageFetcher(requestedUrl);
          content += renderAnalysis(html, requestedUrl);
        } catch (error) {
          const isPublicError = Number.isInteger(error.statusCode);
          res.status(isPublicError ? error.statusCode : 502);
          content += `
            <div class="alert alert-danger" role="alert">
              ${escapeHtml(
                isPublicError
                  ? error.message
                  : "The target website could not be analyzed.",
              )}
            </div>`;
        }
      }

      res.type("html").send(renderPage(content));
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
