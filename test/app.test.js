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

test("renders a successful SEO and social metadata audit", async () => {
  const app = createApp({ pageFetcher: async () => fixtureHtml });
  const response = await request(app)
    .get("/")
    .query({ url: "https://example.com/source" })
    .expect(200);

  assert.match(response.text, /Fixture Open Graph title/);
  assert.match(response.text, /https:\/\/example\.com\/social\.png/);
  assert.match(response.text, /https:\/\/example\.com\/article/);
  assert.match(response.text, /SEO Audit/);
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
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(app.get("trust proxy"), false);
  assert.equal(createApp({ trustProxy: 1 }).get("trust proxy"), 1);
});

test("rate limits repeated analysis requests", async () => {
  const app = createApp({
    pageFetcher: async () => fixtureHtml,
    rateLimitOptions: { limit: 1 },
  });

  await request(app).get("/").query({ url: "https://example.com" }).expect(200);
  await request(app).get("/").query({ url: "https://example.com" }).expect(429);
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
});
