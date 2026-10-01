const assert = require("node:assert/strict");
const test = require("node:test");
const { parseMetadata, safeWebUrl } = require("../lib/metadata");

test("parses normalized metadata while preserving raw social values", () => {
  const metadata = parseMetadata(
    `<!doctype html>
      <html lang="en-US">
        <head>
          <title>  Example title  </title>
          <meta name="description" content=" Example description ">
          <link rel="canonical" href="/canonical">
          <meta name="robots" content="index, follow">
          <meta name="viewport" content="width=device-width">
          <meta property="og:title" content="OG title">
          <meta property="og:description" content="OG description">
          <meta property="og:image" content="/social.png">
          <meta property="og:url" content="/article">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Twitter title">
        </head>
        <body><h1>First</h1><h1>Second</h1></body>
      </html>`,
    "https://example.com/source",
  );

  assert.equal(metadata.title, "Example title");
  assert.equal(metadata.description, "Example description");
  assert.equal(metadata.canonical.raw, "/canonical");
  assert.equal(metadata.canonical.url, "https://example.com/canonical");
  assert.deepEqual(metadata.headings.h1, ["First", "Second"]);
  assert.equal(metadata.document.lang, "en-US");
  assert.equal(metadata.openGraph.image.raw, "/social.png");
  assert.equal(metadata.openGraph.image.url, "https://example.com/social.png");
  assert.equal(metadata.openGraph.url.url, "https://example.com/article");
  assert.equal(metadata.twitter.title, "Twitter title");
  assert.equal(metadata.twitter.description, "");
  assert.equal(metadata.socialTags["og:title"], "OG title");
});

test("keeps missing explicit values separate from display fallbacks", () => {
  const metadata = parseMetadata(
    "<title>Fallback title</title><meta property=\"og:title\" content=\"OG title\">",
    "https://example.com/page",
  );

  assert.equal(metadata.openGraph.image.raw, "");
  assert.equal(metadata.openGraph.image.url, "");
  assert.equal(metadata.twitter.image.raw, "");
  assert.equal(metadata.twitter.image.url, "");
  assert.equal(metadata.twitter.title, "");
});

test("rejects unsafe metadata URLs without discarding the raw evidence", () => {
  const metadata = parseMetadata(
    `<link rel="canonical" href="javascript:alert(1)">
     <meta property="og:image" content="data:text/html,unsafe">`,
    "https://example.com/page",
  );

  assert.equal(metadata.canonical.raw, "javascript:alert(1)");
  assert.equal(metadata.canonical.url, "");
  assert.equal(metadata.openGraph.image.raw, "data:text/html,unsafe");
  assert.equal(metadata.openGraph.image.url, "");
  assert.equal(safeWebUrl("/ok", "https://example.com/page"), "https://example.com/ok");
});
