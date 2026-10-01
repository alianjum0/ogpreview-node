const assert = require("node:assert/strict");
const test = require("node:test");
const { analyzeDocument } = require("../lib/analyze");

const html = `<!doctype html><html lang="en"><head>
  <title>A useful page title that fits the expected range</title>
  <meta name="description" content="A useful page description that is long enough to fit the expected search snippet range without being excessively verbose.">
  <link rel="canonical" href="https://example.com/page">
  <meta name="viewport" content="width=device-width">
  <meta property="og:title" content="A useful page title that fits the expected range">
  <meta property="og:description" content="A useful page description that is long enough to fit the expected search snippet range without being excessively verbose.">
  <meta property="og:image" content="https://example.com/social.png">
  <meta property="og:url" content="https://example.com/page">
  <meta name="twitter:card" content="summary_large_image">
</head><body><h1>Heading</h1></body></html>`;

function find(analysis, id) {
  return analysis.checks.find((check) => check.id === id);
}

test("turns suboptimal inspected image dimensions into an audit warning", async () => {
  const analysis = await analyzeDocument(html, "https://example.com/page", {
    mode: "url",
    imageInspector: async (url) => ({
      url,
      reachable: true,
      https: true,
      contentType: "image/png",
      bytes: 1000,
      width: 600,
      height: 315,
      aspectRatio: 1.9,
      recommendedDimensions: false,
    }),
  });

  assert.equal(analysis.source.mode, "url");
  assert.equal(find(analysis, "og-image").severity, "warning");
  assert.match(find(analysis, "og-image").message, /1200 × 630/);
  assert.equal(analysis.score.warnings > 0, true);
});

test("turns an unreachable inspected image into an audit error", async () => {
  const analysis = await analyzeDocument(html, "https://example.com/page", {
    imageInspector: async () => {
      const error = new Error("The image could not be fetched.");
      error.statusCode = 502;
      throw error;
    },
  });

  assert.equal(find(analysis, "og-image").severity, "error");
  assert.match(find(analysis, "og-image").message, /could not be fetched/);
  assert.equal(analysis.images.openGraph.reachable, false);
});
