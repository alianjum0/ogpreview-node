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

function structuredDataSummary($) {
  return $('script[type="application/ld+json"]')
    .map((_index, element) => {
      try {
        const value = JSON.parse($(element).text());
        const types = new Set();
        const queue = [value];
        let cursor = 0;
        const enqueue = (values) => {
          for (const child of values) {
            if (queue.length >= 10_000) break;
            queue.push(child);
          }
        };
        while (cursor < queue.length && cursor < 10_000 && types.size < 20) {
          const node = queue[cursor];
          cursor += 1;
          if (!node) continue;
          if (Array.isArray(node)) {
            enqueue(node);
            continue;
          }
          if (typeof node !== "object") continue;
          const nodeTypes = Array.isArray(node["@type"])
            ? node["@type"]
            : [node["@type"]];
          nodeTypes.filter((type) => typeof type === "string" && type.trim()).forEach((type) => {
            const normalizedType = type.trim();
            if (types.size < 20 && normalizedType.length <= 100) types.add(normalizedType);
          });
          enqueue(Object.values(node));
        }
        return { valid: true, types: [...types] };
      } catch {
        return { valid: false, types: [], error: "Invalid JSON-LD." };
      }
    })
    .get();
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
    structuredData: structuredDataSummary($),
    socialTags,
  };
}

module.exports = { parseMetadata, safeWebUrl };
