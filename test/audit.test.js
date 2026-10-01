const assert = require("node:assert/strict");
const test = require("node:test");
const { analyzeMetadata } = require("../lib/audit");
const { parseMetadata } = require("../lib/metadata");

function analyze(html, url = "https://example.com/page") {
  return analyzeMetadata(parseMetadata(html, url), url);
}

function check(report, id) {
  const result = report.checks.find((item) => item.id === id);
  assert.ok(result, `Expected check ${id}`);
  return result;
}

test("returns stable actionable checks and a deterministic score", () => {
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
    <meta name="twitter:title" content="A useful page title that fits the expected range">
    <meta name="twitter:description" content="A useful page description that is long enough to fit the expected search snippet range without being excessively verbose.">
    <meta name="twitter:image" content="https://example.com/twitter.png">
  </head><body><h1>Heading</h1></body></html>`;

  const first = analyze(html);
  const second = analyze(html);

  assert.deepEqual(first, second);
  assert.equal(first.score.value, 100);
  assert.equal(first.score.errors, 0);
  assert.equal(first.score.warnings, 0);
  assert.equal(check(first, "title").status, "pass");
  assert.equal(check(first, "og-image").status, "pass");
});

test("reports indexability, canonical, heading, and social failures", () => {
  const report = analyze(`<!doctype html><html><head>
    <title>Short</title>
    <meta name="robots" content="noindex,nofollow">
    <link rel="canonical" href="https://other.example/path">
    <meta property="og:title" content="Completely unrelated social title">
    <meta property="og:url" content="javascript:alert(1)">
    <meta name="twitter:card" content="unsupported">
  </head><body><h1>One</h1><h1>Two</h1></body></html>`);

  assert.equal(check(report, "title").severity, "warning");
  assert.equal(check(report, "description").severity, "error");
  assert.equal(check(report, "canonical-target").severity, "warning");
  assert.equal(check(report, "h1").severity, "warning");
  assert.equal(check(report, "robots-noindex").severity, "error");
  assert.equal(check(report, "robots-nofollow").severity, "warning");
  assert.equal(check(report, "og-url").severity, "error");
  assert.equal(check(report, "twitter-card").severity, "warning");
  assert.ok(report.score.value < 100);
  assert.equal(report.score.errors > 0, true);
  assert.equal(report.score.warnings > 0, true);
});

test("identifies Twitter fallbacks without treating them as explicit tags", () => {
  const report = analyze(`<!doctype html><html lang="en"><head>
    <title>A useful page title that fits the expected range</title>
    <meta name="description" content="A useful page description that is long enough to fit the expected search snippet range without being excessively verbose.">
    <link rel="canonical" href="https://example.com/page">
    <meta name="viewport" content="width=device-width">
    <meta property="og:title" content="A useful page title that fits the expected range">
    <meta property="og:description" content="A useful page description that is long enough to fit the expected search snippet range without being excessively verbose.">
    <meta property="og:image" content="https://example.com/social.png">
    <meta property="og:url" content="https://example.com/page">
    <meta name="twitter:card" content="summary_large_image">
  </head><body><h1>Heading</h1></body></html>`);

  assert.equal(check(report, "twitter-title").status, "info");
  assert.equal(check(report, "twitter-description").status, "info");
  assert.equal(check(report, "twitter-image").status, "info");
  assert.equal(check(report, "twitter-title").weight, 0);
});

test("warns when Open Graph copy significantly differs from page metadata", () => {
  const report = analyze(`<!doctype html><html lang="en"><head>
    <title>Developer guide to reliable metadata previews</title>
    <meta name="description" content="Learn how to build reliable metadata previews with practical validation rules and safe image handling for shared links.">
    <link rel="canonical" href="https://example.com/page">
    <meta name="viewport" content="width=device-width">
    <meta property="og:title" content="Unrelated summer holiday sale">
    <meta property="og:description" content="Book a tropical hotel package with beach access and discounted flights today.">
    <meta property="og:image" content="https://example.com/social.png">
    <meta property="og:url" content="https://example.com/page">
    <meta name="twitter:card" content="summary_large_image">
  </head><body><h1>Guide</h1></body></html>`);

  assert.equal(check(report, "og-title-consistency").severity, "warning");
  assert.equal(check(report, "og-description-consistency").severity, "warning");
});

test("marks URL comparisons as informational when their inputs are absent", () => {
  const report = analyze("<title>Only a short title</title><h1>Heading</h1>");

  assert.equal(check(report, "canonical-target").status, "info");
  assert.equal(check(report, "og-url-canonical").status, "info");
});

test("does not claim text consistency when the heuristic cannot tokenize it", () => {
  const report = analyze(`<!doctype html><html lang="ja"><head>
    <title>開発者向けメタデータガイド</title>
    <meta name="description" content="安全なリンクプレビューを作成するための実践的なガイドです">
    <meta property="og:title" content="安全なリンクプレビュー">
    <meta property="og:description" content="メタデータを検証する方法を説明します">
  </head><body><h1>ガイド</h1></body></html>`);

  assert.equal(check(report, "og-title-consistency").status, "info");
  assert.equal(check(report, "og-description-consistency").status, "info");
});
