const assert = require("node:assert/strict");
const test = require("node:test");
const { serializeAnalysis, toMarkdownReport } = require("../lib/report");

const analysis = {
  source: {
    mode: "url",
    requestedUrl: "https://example.com/page",
    finalUrl: "https://example.com/page",
  },
  score: { value: 82, errors: 1, warnings: 2, passed: 10, info: 1 },
  metadata: {
    title: "Example | title",
    description: "A useful description",
    canonical: { raw: "/page", url: "https://example.com/page" },
    openGraph: {
      title: "Open Graph title",
      description: "Open Graph description",
      image: { raw: "/social.png", url: "https://example.com/social.png" },
      url: { raw: "/page", url: "https://example.com/page" },
    },
    twitter: { card: "summary_large_image" },
  },
  checks: [
    {
      id: "title",
      category: "seo",
      status: "warning",
      message: "Title contains a | delimiter\nand a new line.",
      evidence: "Example | title",
      weight: 3,
    },
  ],
  images: { openGraph: null, twitter: null },
};

test("serializes only the stable public analysis contract", () => {
  const result = serializeAnalysis({ ...analysis, privateState: "do not expose" });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.url, "https://example.com/page");
  assert.equal(result.metadata.title, "Example | title");
  assert.equal(result.privateState, undefined);
  assert.deepEqual(Object.keys(result), [
    "schemaVersion",
    "url",
    "source",
    "score",
    "metadata",
    "checks",
    "images",
  ]);
});

test("creates a deterministic Markdown report without broken table rows", () => {
  const report = toMarkdownReport(analysis);

  assert.match(report, /^# MetaScope audit: https:\/\/example\.com\/page/m);
  assert.match(report, /Score: \*\*82\/100\*\*/);
  assert.match(report, /Example \\| title/);
  assert.match(report, /Title contains a \\| delimiter and a new line\./);
  assert.match(report, /## Detected metadata/);
  assert.ok(report.endsWith("\n"));
});
