const cheerio = require("cheerio");
const { analyzeHtml } = require("./analyze");
const { TargetUrlError, normalizeTargetUrl } = require("./safe-fetch");

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_SITEMAPS = 3;
const DEFAULT_CONCURRENCY = 3;

function parseSitemap(xml, sitemapUrl) {
  const $ = cheerio.load(xml || "", { xmlMode: true });
  const type = $("urlset").length ? "urlset" : $("sitemapindex").length ? "index" : "";
  if (!type) throw new TargetUrlError("The target URL did not contain a valid sitemap.");
  const selector = type === "urlset" ? "url > loc" : "sitemap > loc";
  const locations = $(selector)
    .map((_index, element) => {
      try {
        const url = new URL($(element).text().trim(), sitemapUrl);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);
  return { type, locations };
}

function sameOriginLocations(locations, origin) {
  const accepted = [];
  let externalSkipped = 0;
  let invalidSkipped = 0;
  for (const value of locations) {
    try {
      const normalized = normalizeTargetUrl(value);
      if (new URL(normalized).origin !== origin) {
        externalSkipped += 1;
      } else {
        accepted.push(normalized);
      }
    } catch {
      invalidSkipped += 1;
    }
  }
  return { accepted, externalSkipped, invalidSkipped };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function duplicateGroups(pages, field) {
  const groups = new Map();
  for (const page of pages.filter((item) => item.status === "ok")) {
    const value = page.metadata[field];
    if (!value) continue;
    const key = value.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { value, urls: [] });
    groups.get(key).urls.push(page.url);
  }
  return [...groups.values()].filter((group) => group.urls.length > 1);
}

function pageResult(url, analysis) {
  const structuredData = analysis.metadata.structuredData || [];
  return {
    url,
    status: "ok",
    score: analysis.score,
    metadata: {
      title: analysis.metadata.title,
      description: analysis.metadata.description,
      canonical: analysis.metadata.canonical.url || analysis.metadata.canonical.raw,
      openGraphImage: analysis.metadata.openGraph.image.url || analysis.metadata.openGraph.image.raw,
      twitterCard: analysis.metadata.twitter.card,
    },
    structuredData: {
      blocks: structuredData.length,
      valid: structuredData.filter((item) => item.valid).length,
      invalid: structuredData.filter((item) => !item.valid).length,
      types: [...new Set(structuredData.flatMap((item) => item.types || []))],
    },
    checks: analysis.checks,
  };
}

async function auditSite(sitemapValue, {
  concurrency = DEFAULT_CONCURRENCY,
  maxPages = DEFAULT_MAX_PAGES,
  maxSitemaps = DEFAULT_MAX_SITEMAPS,
  pageFetcher,
  sitemapFetcher,
} = {}) {
  if (typeof sitemapFetcher !== "function" || typeof pageFetcher !== "function") {
    throw new TypeError("Site audit fetchers are required.");
  }
  const sitemapUrl = normalizeTargetUrl(sitemapValue);
  const origin = new URL(sitemapUrl).origin;
  const root = parseSitemap(await sitemapFetcher(sitemapUrl), sitemapUrl);
  let pageLocations = root.type === "urlset" ? root.locations : [];
  let externalSkipped = 0;
  let invalidSkipped = 0;
  let childSitemaps = 0;
  let childSitemapFailures = 0;

  if (root.type === "index") {
    const filtered = sameOriginLocations(root.locations, origin);
    externalSkipped += filtered.externalSkipped;
    invalidSkipped += filtered.invalidSkipped;
    const sitemapUrls = [...new Set(filtered.accepted)].slice(0, maxSitemaps);
    childSitemaps = sitemapUrls.length;
    for (const childUrl of sitemapUrls) {
      try {
        const child = parseSitemap(await sitemapFetcher(childUrl), childUrl);
        if (child.type === "urlset") pageLocations.push(...child.locations);
      } catch {
        childSitemapFailures += 1;
      }
    }
  }

  const filteredPages = sameOriginLocations(pageLocations, origin);
  externalSkipped += filteredPages.externalSkipped;
  invalidSkipped += filteredPages.invalidSkipped;
  const discoveredPages = [...new Set(filteredPages.accepted)];
  if (!discoveredPages.length) {
    throw new TargetUrlError("The sitemap did not contain any same-origin page URLs.");
  }
  const selectedPages = discoveredPages.slice(0, maxPages);
  const pages = await mapWithConcurrency(selectedPages, concurrency, async (url) => {
    try {
      return pageResult(url, analyzeHtml(await pageFetcher(url), url));
    } catch (error) {
      return {
        url,
        status: "error",
        error: Number.isInteger(error.statusCode)
          ? error.message
          : "The page could not be analyzed.",
      };
    }
  });
  const successfulPages = pages.filter((page) => page.status === "ok");
  const averageScore = successfulPages.length
    ? Math.round(successfulPages.reduce((total, page) => total + page.score.value, 0) / successfulPages.length)
    : null;

  return {
    schemaVersion: 1,
    source: { sitemapUrl, sitemapType: root.type },
    limits: { maxPages, maxSitemaps, concurrency },
    discovery: {
      discovered: discoveredPages.length,
      truncated: Math.max(0, discoveredPages.length - selectedPages.length),
      externalSkipped,
      invalidSkipped,
      childSitemaps,
      childSitemapFailures,
    },
    summary: {
      total: pages.length,
      succeeded: successfulPages.length,
      failed: pages.length - successfulPages.length,
      averageScore,
    },
    duplicates: {
      titles: duplicateGroups(pages, "title"),
      descriptions: duplicateGroups(pages, "description"),
      canonicals: duplicateGroups(pages, "canonical"),
    },
    pages,
  };
}

module.exports = {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_SITEMAPS,
  auditSite,
  parseSitemap,
};
