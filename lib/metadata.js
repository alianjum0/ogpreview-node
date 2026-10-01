const cheerio = require("cheerio");

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
  return ($(selector).first().attr("content") || "").trim();
}

function urlValue(raw, baseUrl) {
  return { raw, url: safeWebUrl(raw, baseUrl) };
}

function parseMetadata(html, baseUrl) {
  const $ = cheerio.load(html || "");
  const canonicalRaw = ($('link[rel="canonical"]').first().attr("href") || "").trim();
  const ogImageRaw = metaContent($, 'meta[property="og:image"]');
  const ogUrlRaw = metaContent($, 'meta[property="og:url"]');
  const twitterImageRaw = metaContent($, 'meta[name="twitter:image"]');
  const socialTags = {};

  $("meta").each((_index, element) => {
    const property = ($(element).attr("property") || "").trim();
    const name = ($(element).attr("name") || "").trim();
    const value = ($(element).attr("content") || "").trim();
    if (!value) return;
    if (property.startsWith("og:") || property.startsWith("twitter:")) {
      socialTags[property] = value;
    }
    if (name.startsWith("og:") || name.startsWith("twitter:")) {
      socialTags[name] = value;
    }
  });

  return {
    sourceUrl: safeWebUrl(baseUrl, undefined),
    title: $("title").first().text().trim(),
    description: metaContent($, 'meta[name="description"]'),
    canonical: urlValue(canonicalRaw, baseUrl),
    headings: {
      h1: $("h1")
        .map((_index, element) => $(element).text().trim())
        .get()
        .filter(Boolean),
    },
    document: {
      lang: ($("html").attr("lang") || "").trim(),
      robots: metaContent($, 'meta[name="robots"]'),
      viewport: metaContent($, 'meta[name="viewport"]'),
    },
    openGraph: {
      title: metaContent($, 'meta[property="og:title"]'),
      description: metaContent($, 'meta[property="og:description"]'),
      image: urlValue(ogImageRaw, baseUrl),
      url: urlValue(ogUrlRaw, baseUrl),
    },
    twitter: {
      card: metaContent($, 'meta[name="twitter:card"]'),
      title: metaContent($, 'meta[name="twitter:title"]'),
      description: metaContent($, 'meta[name="twitter:description"]'),
      image: urlValue(twitterImageRaw, baseUrl),
    },
    socialTags,
  };
}

module.exports = { parseMetadata, safeWebUrl };
