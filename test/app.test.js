const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp, escapeHtml, safeWebUrl } = require("../server");

const fixtureHtml = `<!doctype html>
  <html lang="en">
    <head>
      <title>A useful fixture title for search results</title>
      <meta name="description" content="A useful fixture description that is long enough for the SEO audit checks in this application.">
      <meta property="og:title" content="Fixture Open Graph title">
      <meta property="og:description" content="Fixture Open Graph description">
      <meta property="og:image" content="/social.png">
      <meta property="og:url" content="/article">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Fixture Twitter title">
      <meta name="twitter:description" content="Fixture Twitter description">
      <meta name="twitter:image" content="/twitter.png">
    </head>
    <body><h1>Fixture heading</h1></body>
  </html>`;

const successfulImageInspector = async (url) => ({
  url,
  reachable: true,
  contentType: "image/png",
  bytes: 184000,
  width: 1200,
  height: 630,
  aspectRatio: 1.9,
  recommendedDimensions: true,
  https: true,
});

test("renders a successful SEO and social metadata audit", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
  });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/source" })
    .expect(200);

  assert.match(response.text, /Fixture Open Graph title/);
  assert.match(response.text, /url=https%3A%2F%2Fexample\.com%2Fsocial\.png/);
  assert.match(response.text, /https:\/\/example\.com\/article/);
  assert.match(response.text, /1200 × 630/);
  assert.match(response.text, /184 KB/);
  assert.doesNotMatch(response.text, /src="https:\/\/example\.com\/social\.png"/);
  assert.match(response.text, /src="\/preview-image\?url=/);
  assert.match(response.text, /data-metadata-editor/);
  assert.match(response.text, /name="ogTitle" value="Fixture Open Graph title"/);
  assert.match(response.text, /data-generated-tags/);
  assert.match(response.text, /src="\/tag-generator\.js"/);
  assert.match(response.text, /src="\/app\.js"/);
  assert.match(response.text, /SEO Audit/);
});

test("renders Slack and WhatsApp previews with URL sharing actions", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
  });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/source" })
    .expect(200);

  assert.match(response.text, />Slack</);
  assert.match(response.text, />WhatsApp</);
  assert.match(response.text, /data-preview-platform="slack"/);
  assert.match(response.text, /data-preview-platform="whatsapp"/);
  assert.match(response.text, /data-copy-audit-link/);
  assert.match(response.text, /href="\/api\/analyze\?url=https%3A%2F%2Fexample\.com%2Fsource"/);
  assert.match(response.text, /href="\/report\.md\?url=https%3A%2F%2Fexample\.com%2Fsource"/);
});

test("exposes a stable JSON analysis API", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
  });
  const response = await request(app)
    .get("/api/analyze")
    .query({ url: "https://example.com/source" })
    .expect("Content-Type", /json/)
    .expect(200);

  assert.equal(response.body.schemaVersion, 1);
  assert.equal(response.body.url, "https://example.com/source");
  assert.equal(response.body.source.mode, "url");
  assert.equal(response.body.metadata.title, "A useful fixture title for search results");
  assert.equal(typeof response.body.score.value, "number");
  assert.ok(response.body.checks.some((check) => check.id === "og-title"));
  assert.equal(response.body.images.openGraph.width, 1200);
});

test("returns safe JSON API validation and upstream errors", async () => {
  const app = createApp({
    pageFetcher: async () => {
      throw new Error("sensitive upstream detail");
    },
  });

  const missing = await request(app).get("/api/analyze").expect(400);
  assert.deepEqual(missing.body, { error: "A URL is required." });

  const failed = await request(app)
    .get("/api/analyze")
    .query({ url: "https://example.com" })
    .expect(502);
  assert.deepEqual(failed.body, { error: "The target website could not be analyzed." });
  assert.doesNotMatch(JSON.stringify(failed.body), /sensitive upstream detail/);
});

test("keeps API rate-limit errors in the JSON contract", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
    rateLimitOptions: { limit: 1 },
  });

  await request(app)
    .get("/api/analyze")
    .query({ url: "https://example.com" })
    .expect(200);
  const limited = await request(app)
    .get("/api/analyze")
    .query({ url: "https://example.com" })
    .expect("Content-Type", /json/)
    .expect(429);

  assert.deepEqual(limited.body, {
    error: "Too many analysis requests. Please try again later.",
  });
});

test("downloads a Markdown audit report for a public URL", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
  });
  const response = await request(app)
    .get("/report.md")
    .query({ url: "https://example.com/source" })
    .expect("Content-Type", /text\/markdown/)
    .expect(200);

  assert.match(response.headers["content-disposition"], /attachment; filename="metascope-report\.md"/);
  assert.match(response.text, /# MetaScope audit: https:\/\/example\.com\/source/);
  assert.match(response.text, /Score: \*\*\d+\/100\*\*/);
  assert.match(response.text, /\| Status \| Category \| Check \| Finding \|/);
  assert.match(response.text, /Fixture Open Graph title/);
});

test("offers a bounded sitemap audit and renders site-level findings", async () => {
  const sitemap = `<urlset>
    <url><loc>https://example.com/a</loc></url>
    <url><loc>https://example.com/b</loc></url>
  </urlset>`;
  const app = createApp({
    sitemapFetcher: async () => sitemap,
    pageFetcher: async () => fixtureHtml,
  });

  const landing = await request(app).get("/").expect(200);
  assert.match(landing.text, /data-input-mode="sitemap"/);
  assert.match(landing.text, /action="\/site"/);

  const response = await request(app)
    .get("/site")
    .query({ url: "https://example.com/sitemap.xml" })
    .expect(200);

  assert.match(response.text, /Site audit/);
  assert.match(response.text, /2 pages analyzed/);
  assert.match(response.text, /Duplicate titles/);
  assert.match(response.text, /https:\/\/example\.com\/a/);
  assert.match(response.text, /https:\/\/example\.com\/b/);
});

test("exposes the bounded site audit as JSON", async () => {
  const app = createApp({
    sitemapFetcher: async () => '<urlset><url><loc>https://example.com/a</loc></url></urlset>',
    pageFetcher: async () => fixtureHtml,
  });
  const response = await request(app)
    .get("/api/site")
    .query({ url: "https://example.com/sitemap.xml" })
    .expect("Content-Type", /json/)
    .expect(200);

  assert.equal(response.body.schemaVersion, 1);
  assert.equal(response.body.source.sitemapUrl, "https://example.com/sitemap.xml");
  assert.equal(response.body.summary.total, 1);
  assert.equal(response.body.pages[0].url, "https://example.com/a");
  assert.equal(response.body.limits.maxPages, 10);
});

test("returns safe site API validation and upstream errors", async () => {
  const app = createApp({
    sitemapFetcher: async () => {
      throw new Error("sensitive sitemap detail");
    },
  });

  const missing = await request(app).get("/api/site").expect(400);
  assert.deepEqual(missing.body, { error: "Enter a valid HTTP or HTTPS URL." });

  const failed = await request(app)
    .get("/api/site")
    .query({ url: "https://example.com/sitemap.xml" })
    .expect(502);
  assert.deepEqual(failed.body, { error: "The sitemap could not be analyzed." });
  assert.doesNotMatch(JSON.stringify(failed.body), /sensitive sitemap detail/);
});

test("explains the product and next step on the landing page", async () => {
  const app = createApp();
  const response = await request(app).get("/").expect(200);

  assert.match(response.text, /Preview how your page appears before you share it/);
  assert.match(response.text, /Enter a public page URL/);
  assert.match(response.text, /Run free audit/);
  assert.match(response.text, /No signup\. No API key\./);
  assert.match(response.text, /Metadata debugger/);
  assert.match(response.text, /request-method">GET/);
  assert.doesNotMatch(response.text, /Portfolio project/);
});

test("summarizes audit health and exposes semantic result statuses", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
  });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/source" })
    .expect(200);

  assert.match(response.text, /Audit results/);
  assert.match(response.text, /metadata score/);
  assert.match(response.text, /errors · \d+ warnings · \d+ passed/);
  assert.match(response.text, /class="status status--pass"/);
  assert.match(response.text, /class="status status--warning"/);
  assert.match(response.text, /Search result preview/);
});

test("does not count fallback URLs as complete Open Graph metadata", async () => {
  const partialOpenGraphHtml = `
    <title>Partial metadata fixture</title>
    <meta property="og:title" content="Partial Open Graph title">
    <meta property="og:description" content="Partial Open Graph description">`;
  const app = createApp({ pageFetcher: async () => partialOpenGraphHtml });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/source" })
    .expect(200);

  assert.match(response.text, /Open Graph image/);
  assert.match(response.text, /Add og:image/);
  assert.match(response.text, /Open Graph URL/);
  assert.match(response.text, /Add og:url/);
  assert.match(response.text, /src="\/preview-placeholder\.svg"/);
});

test("offers URL and pasted HTML analysis modes", async () => {
  const app = createApp();
  const response = await request(app).get("/").expect(200);

  assert.match(response.text, /data-input-mode="url"/);
  assert.match(response.text, /data-input-mode="html"/);
  assert.match(response.text, /action="\/analyze\/html"/);
  assert.match(response.text, /name="html"/);
  assert.match(response.text, /name="baseUrl"/);
});

test("analyzes pasted HTML without calling the page fetcher", async () => {
  let fetchCount = 0;
  const app = createApp({
    pageFetcher: async () => {
      fetchCount += 1;
      throw new Error("must not fetch");
    },
    imageInspector: successfulImageInspector,
  });

  const response = await request(app)
    .post("/analyze/html")
    .type("form")
    .send({
      baseUrl: "https://example.com/draft",
      html: '<title>Pasted draft</title><meta property="og:image" content="/draft.png"><h1>Draft</h1>',
    })
    .expect(200);

  assert.equal(fetchCount, 0);
  assert.match(response.text, /Pasted draft/);
  assert.match(response.text, /url=https%3A%2F%2Fexample\.com%2Fdraft\.png/);
});

test("rejects unsafe HTML base URLs", async () => {
  const app = createApp();
  const response = await request(app)
    .post("/analyze/html")
    .type("form")
    .send({ baseUrl: "http://127.0.0.1/private", html: "<title>Draft</title>" })
    .expect(400);

  assert.match(response.text, /Private and local network addresses are not allowed/);
});

test("bounds pasted HTML input", async () => {
  const app = createApp();
  const response = await request(app)
    .post("/analyze/html")
    .type("form")
    .send({ html: `<title>${"x".repeat(300 * 1024)}</title>` })
    .expect(413);

  assert.match(response.text, /Pasted HTML must be 256 KB or smaller/);
  assert.doesNotMatch(response.text, /PayloadTooLargeError/);
});

test("serves the local responsive stylesheet", async () => {
  const app = createApp();
  const response = await request(app).get("/styles.css").expect(200);

  assert.match(response.headers["content-type"], /text\/css/);
  assert.match(response.text, /@media \(max-width: 720px\)/);
});

test("escapes untrusted metadata and rejects unsafe preview URLs", async () => {
  const maliciousHtml = `
    <title>Safe fallback</title>
    <meta property="og:title" content="&lt;script&gt;alert(1)&lt;/script&gt;">
    <meta property="og:description" content="&quot; onclick=&quot;alert(1)">
    <meta property="og:image" content="javascript:alert(1)">
    <meta property="og:url" content="data:text/html,unsafe">`;
  const app = createApp({ pageFetcher: async () => maliciousHtml });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/" })
    .expect(200);

  assert.doesNotMatch(response.text, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(response.text, /(?:src|href)="javascript:/);
  assert.doesNotMatch(response.text, /href="data:/);
  assert.match(response.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("returns safe error statuses and messages", async () => {
  const invalidTarget = new Error("Only HTTP and HTTPS URLs are supported.");
  invalidTarget.statusCode = 400;
  const app = createApp({
    pageFetcher: async () => {
      throw invalidTarget;
    },
  });

  const response = await request(app)
    .get("/")
    .query({ url: "file:///etc/passwd" })
    .expect(400);

  assert.match(response.text, /Only HTTP and HTTPS URLs are supported/);
});

test("does not expose unexpected internal error details", async () => {
  const app = createApp({
    pageFetcher: async () => {
      throw new Error("sensitive implementation detail");
    },
  });

  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com" })
    .expect(502);

  assert.doesNotMatch(response.text, /sensitive implementation detail/);
  assert.match(response.text, /target website could not be analyzed/i);
});

test("sets security headers and hides the Express signature", async () => {
  const app = createApp();
  const response = await request(app).get("/").expect(200);

  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
  assert.match(response.headers["content-security-policy"], /script-src 'self'/);
  assert.doesNotMatch(response.headers["content-security-policy"], /script-src 'unsafe-inline'/);
  assert.match(response.headers["content-security-policy"], /img-src 'self' data:/);
  assert.doesNotMatch(response.headers["content-security-policy"], /img-src[^;]*https:/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(app.get("trust proxy"), false);
  assert.equal(createApp({ trustProxy: 1 }).get("trust proxy"), 1);
});

test("rate limits repeated analysis requests", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    imageInspector: successfulImageInspector,
    rateLimitOptions: { limit: 1 },
  });

  await request(app).get("/").query({ url: "https://example.com" }).expect(200);
  await request(app).get("/").query({ url: "https://example.com" }).expect(429);
});

test("serves validated preview images through the same-origin route", async () => {
  let requestedUrl;
  const app = createApp({
    imageFetcher: async (url) => {
      requestedUrl = url;
      return {
        url,
        contentType: "image/png",
        buffer: Buffer.from("safe-image"),
      };
    },
  });

  const response = await request(app)
    .get("/preview-image")
    .query({ url: "https://example.com/social.png" })
    .expect(200);

  assert.equal(requestedUrl, "https://example.com/social.png");
  assert.match(response.headers["content-type"], /image\/png/);
  assert.equal(response.headers["cache-control"], "private, max-age=300");
});

test("serves the local editor script without unsafe DOM insertion", async () => {
  const app = createApp();
  const response = await request(app).get("/app.js").expect(200);

  assert.match(response.headers["content-type"], /javascript/);
  assert.match(response.text, /textContent/);
  assert.match(response.text, /data-copy-audit-link/);
  assert.doesNotMatch(response.text, /\.innerHTML\s*=/);
});

test("escapes attribute delimiters and allows only web URLs", () => {
  assert.equal(escapeHtml(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
  assert.equal(
    safeWebUrl("/image.png", "https://example.com/page"),
    "https://example.com/image.png",
  );
  assert.equal(
    safeWebUrl("javascript:alert(1)", "https://example.com", "fallback"),
    "fallback",
  );
  assert.equal(
    safeWebUrl("", "https://example.com", "/preview-placeholder.svg"),
    "/preview-placeholder.svg",
  );
});
