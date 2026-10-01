const assert = require("node:assert/strict");
const test = require("node:test");
const { auditSite, parseSitemap } = require("../lib/site-audit");

const page = ({ title, description, canonical, structuredData = "" }) => `<!doctype html>
  <html lang="en"><head>
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <meta name="viewport" content="width=device-width">
    ${structuredData}
  </head><body><h1>${title}</h1></body></html>`;

test("parses sitemap URL sets and indexes", () => {
  assert.deepEqual(
    parseSitemap(`<?xml version="1.0"?><urlset>
      <url><loc>https://example.com/a</loc></url>
      <url><loc>/b</loc></url>
    </urlset>`, "https://example.com/sitemap.xml"),
    { type: "urlset", locations: ["https://example.com/a", "https://example.com/b"] },
  );
  assert.deepEqual(
    parseSitemap(`<sitemapindex><sitemap><loc>/posts.xml</loc></sitemap></sitemapindex>`, "https://example.com/sitemap.xml"),
    { type: "index", locations: ["https://example.com/posts.xml"] },
  );
  assert.throws(() => parseSitemap("<html></html>", "https://example.com/sitemap.xml"), /valid sitemap/);
});

test("audits a bounded same-origin page set and reports duplicates", async () => {
  const sitemap = `<urlset>
    <url><loc>https://example.com/a</loc></url>
    <url><loc>https://example.com/b</loc></url>
    <url><loc>https://outside.example/x</loc></url>
    <url><loc>https://example.com/c</loc></url>
    <url><loc>https://example.com/d</loc></url>
  </urlset>`;
  const pages = {
    "https://example.com/a": page({ title: "Duplicate title", description: "Duplicate description long enough for audit checks on page a.", canonical: "https://example.com/shared" }),
    "https://example.com/b": page({ title: "Duplicate title", description: "Duplicate description long enough for audit checks on page a.", canonical: "https://example.com/shared" }),
    "https://example.com/c": page({ title: "Unique page title", description: "A separate description long enough for the audit checks on page c.", canonical: "https://example.com/c", structuredData: '<script type="application/ld+json">{"@type":"Article"}</script>' }),
  };
  let activeRequests = 0;
  let peakRequests = 0;

  const result = await auditSite("https://example.com/sitemap.xml", {
    sitemapFetcher: async () => sitemap,
    pageFetcher: async (url) => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      await new Promise((resolve) => setImmediate(resolve));
      activeRequests -= 1;
      return pages[url];
    },
    maxPages: 3,
    concurrency: 2,
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.succeeded, 3);
  assert.equal(result.discovery.externalSkipped, 1);
  assert.equal(result.discovery.truncated, 1);
  assert.equal(peakRequests, 2);
  assert.deepEqual(result.pages.map((item) => item.url), [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ]);
  assert.deepEqual(result.duplicates.titles[0].urls, [
    "https://example.com/a",
    "https://example.com/b",
  ]);
  assert.equal(result.pages[2].structuredData.types[0], "Article");
});

test("supports one sitemap-index level and preserves safe page failures", async () => {
  const fetchedSitemaps = [];
  const result = await auditSite("https://example.com/sitemap.xml", {
    sitemapFetcher: async (url) => {
      fetchedSitemaps.push(url);
      if (url.endsWith("sitemap.xml")) {
        return `<sitemapindex>
          <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
          <sitemap><loc>https://outside.example/private.xml</loc></sitemap>
        </sitemapindex>`;
      }
      return `<urlset><url><loc>https://example.com/ok</loc></url><url><loc>https://example.com/fail</loc></url></urlset>`;
    },
    pageFetcher: async (url) => {
      if (url.endsWith("/fail")) throw new Error("private upstream detail");
      return page({ title: "Working page title", description: "A working page description long enough for deterministic checks.", canonical: url });
    },
  });

  assert.deepEqual(fetchedSitemaps, [
    "https://example.com/sitemap.xml",
    "https://example.com/pages.xml",
  ]);
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.pages[1].error, "The page could not be analyzed.");
  assert.doesNotMatch(JSON.stringify(result), /private upstream detail/);
});
