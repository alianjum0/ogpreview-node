const assert = require("node:assert/strict");
const test = require("node:test");
const { generateTags } = require("../public/tag-generator");

test("generates stable escaped head tags", () => {
  const tags = generateTags({
    title: 'A "useful" title & more',
    description: "A <safe> description",
    canonical: "https://example.com/page",
    ogTitle: "Open Graph title",
    ogDescription: "Open Graph description",
    ogImage: "https://example.com/social.png",
    ogUrl: "https://example.com/page",
    twitterCard: "summary_large_image",
    twitterTitle: "Twitter title",
    twitterDescription: "Twitter description",
    twitterImage: "https://example.com/twitter.png",
  });

  assert.match(tags, /<title>A &quot;useful&quot; title &amp; more<\/title>/);
  assert.match(tags, /content="A &lt;safe&gt; description"/);
  assert.match(tags, /rel="canonical" href="https:\/\/example\.com\/page"/);
  assert.match(tags, /property="og:image" content="https:\/\/example\.com\/social\.png"/);
  assert.match(tags, /name="twitter:card" content="summary_large_image"/);
});

test("omits empty optional fields and unsafe URLs", () => {
  const tags = generateTags({
    title: "Only title",
    canonical: "javascript:alert(1)",
    ogImage: "data:text/html,unsafe",
    twitterTitle: "",
  });

  assert.equal(tags, "<title>Only title</title>");
  assert.doesNotMatch(tags, /canonical|og:image|twitter:title|javascript|data:/);
});
