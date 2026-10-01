const VALID_TWITTER_CARDS = new Set([
  "app",
  "player",
  "summary",
  "summary_large_image",
]);

function result(id, category, severity, message, evidence = "") {
  const status = severity === "pass" ? "pass" : severity;
  return {
    id,
    category,
    severity,
    status,
    message,
    evidence,
    weight: severity === "error" ? 10 : severity === "warning" ? 3 : 0,
  };
}

function lengthCheck(id, label, value, minimum, maximum) {
  if (!value) {
    return result(id, "seo", "error", `Add a ${label}.`);
  }
  if (value.length < minimum || value.length > maximum) {
    return result(
      id,
      "seo",
      "warning",
      `${label[0].toUpperCase()}${label.slice(1)} should be between ${minimum} and ${maximum} characters.`,
      `${value.length} characters`,
    );
  }
  return result(id, "seo", "pass", `${label[0].toUpperCase()}${label.slice(1)} looks good.`, `${value.length} characters`);
}

function normalizedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function textDifference(first, second) {
  if (!first || !second) return null;
  const words = (value) => new Set(
    value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) || [],
  );
  const firstWords = words(first);
  const secondWords = words(second);
  if (!firstWords.size || !secondWords.size) return null;
  const overlap = [...firstWords].filter((word) => secondWords.has(word)).length;
  return overlap / Math.min(firstWords.size, secondWords.size) < 0.5;
}

function summarizeChecks(checks) {
  const deduction = checks.reduce((total, check) => total + check.weight, 0);
  return {
    value: Math.max(0, 100 - deduction),
    errors: checks.filter((check) => check.status === "error").length,
    warnings: checks.filter((check) => check.status === "warning").length,
    passed: checks.filter((check) => check.status === "pass").length,
    info: checks.filter((check) => check.status === "info").length,
  };
}

function socialField(id, category, label, explicitValue, fallbackValue) {
  if (explicitValue) return result(id, category, "pass", `${label} is explicitly defined.`);
  if (fallbackValue) {
    return result(id, category, "info", `${label} falls back to Open Graph metadata.`);
  }
  return result(id, category, "warning", `Add ${label}.`);
}

function analyzeMetadata(metadata, targetUrl) {
  const checks = [];
  checks.push(lengthCheck("title", "title", metadata.title, 30, 60));
  checks.push(lengthCheck("description", "meta description", metadata.description, 50, 160));

  if (!metadata.canonical.raw) {
    checks.push(result("canonical", "seo", "warning", "Add a canonical URL."));
  } else if (!metadata.canonical.url) {
    checks.push(result("canonical", "seo", "error", "Use a valid HTTP or HTTPS canonical URL.", metadata.canonical.raw));
  } else {
    checks.push(result("canonical", "seo", "pass", "Canonical URL is valid.", metadata.canonical.url));
  }

  const canonical = normalizedUrl(metadata.canonical.url);
  const target = normalizedUrl(targetUrl);
  checks.push(
    !canonical || !target
      ? result("canonical-target", "seo", "info", "Canonical comparison was not evaluated.")
      : canonical !== target
        ? result("canonical-target", "seo", "warning", "Canonical URL differs from the analyzed URL.", canonical)
        : result("canonical-target", "seo", "pass", "Canonical URL matches the analyzed URL."),
  );

  const h1Count = metadata.headings.h1.length;
  checks.push(
    h1Count === 0
      ? result("h1", "seo", "error", "Add one primary H1 heading.")
      : h1Count > 1
        ? result("h1", "seo", "warning", "Use one primary H1 heading.", `${h1Count} H1 elements`)
        : result("h1", "seo", "pass", "One primary H1 heading was found."),
  );

  const lang = metadata.document.lang;
  checks.push(
    !lang
      ? result("language", "seo", "warning", "Add a language attribute to the html element.")
      : /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(lang)
        ? result("language", "seo", "pass", "Document language is defined.", lang)
        : result("language", "seo", "warning", "Use a valid language tag.", lang),
  );
  checks.push(
    metadata.document.viewport
      ? result("viewport", "seo", "pass", "Viewport metadata is defined.")
      : result("viewport", "seo", "warning", "Add viewport metadata for responsive layouts."),
  );

  const robots = metadata.document.robots.toLowerCase().split(/\s*,\s*/).filter(Boolean);
  checks.push(
    robots.includes("noindex")
      ? result("robots-noindex", "indexability", "error", "Remove noindex to allow search indexing.")
      : result("robots-noindex", "indexability", "pass", "The page is not marked noindex."),
  );
  checks.push(
    robots.includes("nofollow")
      ? result("robots-nofollow", "indexability", "warning", "Remove nofollow if crawlers should follow page links.")
      : result("robots-nofollow", "indexability", "pass", "The page is not marked nofollow."),
  );

  for (const [id, label, value] of [
    ["og-title", "og:title", metadata.openGraph.title],
    ["og-description", "og:description", metadata.openGraph.description],
    ["og-image", "og:image", metadata.openGraph.image.raw],
  ]) {
    checks.push(
      value
        ? result(id, "open-graph", "pass", `${label} is defined.`)
        : result(id, "open-graph", "error", `Add ${label}.`),
    );
  }

  checks.push(
    !metadata.openGraph.url.raw
      ? result("og-url", "open-graph", "error", "Add og:url.")
      : metadata.openGraph.url.url
        ? result("og-url", "open-graph", "pass", "og:url is valid.")
        : result("og-url", "open-graph", "error", "Use a valid HTTP or HTTPS og:url.", metadata.openGraph.url.raw),
  );
  checks.push(
    !metadata.openGraph.url.url || !canonical
      ? result("og-url-canonical", "open-graph", "info", "Open Graph URL comparison was not evaluated.")
      : normalizedUrl(metadata.openGraph.url.url) !== canonical
        ? result("og-url-canonical", "open-graph", "warning", "og:url differs from the canonical URL.")
        : result("og-url-canonical", "open-graph", "pass", "og:url is consistent with the canonical URL."),
  );
  const titleDifference = textDifference(metadata.openGraph.title, metadata.title);
  checks.push(
    titleDifference === null
      ? result("og-title-consistency", "open-graph", "info", "Title consistency was not evaluated.")
      : titleDifference
        ? result("og-title-consistency", "open-graph", "warning", "og:title differs significantly from the page title.")
        : result("og-title-consistency", "open-graph", "pass", "Open Graph and page titles are consistent."),
  );
  const descriptionDifference = textDifference(
    metadata.openGraph.description,
    metadata.description,
  );
  checks.push(
    descriptionDifference === null
      ? result("og-description-consistency", "open-graph", "info", "Description consistency was not evaluated.")
      : descriptionDifference
        ? result("og-description-consistency", "open-graph", "warning", "og:description differs significantly from the meta description.")
        : result("og-description-consistency", "open-graph", "pass", "Open Graph and meta descriptions are consistent."),
  );

  checks.push(
    !metadata.twitter.card
      ? result("twitter-card", "twitter", "warning", "Add twitter:card.")
      : VALID_TWITTER_CARDS.has(metadata.twitter.card)
        ? result("twitter-card", "twitter", "pass", "Twitter card type is supported.", metadata.twitter.card)
        : result("twitter-card", "twitter", "warning", "Use a supported Twitter card type.", metadata.twitter.card),
  );
  checks.push(socialField("twitter-title", "twitter", "twitter:title", metadata.twitter.title, metadata.openGraph.title));
  checks.push(socialField("twitter-description", "twitter", "twitter:description", metadata.twitter.description, metadata.openGraph.description));
  checks.push(socialField("twitter-image", "twitter", "twitter:image", metadata.twitter.image.raw, metadata.openGraph.image.raw));

  const structuredData = metadata.structuredData || [];
  const invalidStructuredData = structuredData.filter((item) => !item.valid).length;
  const structuredTypes = [...new Set(structuredData.flatMap((item) => item.types || []))];
  checks.push(
    !structuredData.length
      ? result("structured-data", "structured-data", "info", "No JSON-LD structured data was found.")
      : invalidStructuredData
        ? result("structured-data", "structured-data", "error", `${invalidStructuredData} invalid JSON-LD block${invalidStructuredData === 1 ? " was" : "s were"} found.`)
        : !structuredTypes.length
          ? result("structured-data", "structured-data", "warning", "JSON-LD is valid but does not declare an @type.")
          : result("structured-data", "structured-data", "pass", "JSON-LD structured data is valid.", structuredTypes.join(", ")),
  );

  return {
    checks,
    score: summarizeChecks(checks),
  };
}

module.exports = { analyzeMetadata, summarizeChecks };
