const { analyzeMetadata, summarizeChecks } = require("./audit");
const { parseMetadata } = require("./metadata");

function analyzeHtml(html, sourceUrl) {
  const metadata = parseMetadata(html, sourceUrl);
  return {
    source: { mode: "html", requestedUrl: sourceUrl || "", finalUrl: sourceUrl || "" },
    metadata,
    ...analyzeMetadata(metadata, sourceUrl),
  };
}

async function analyzeDocument(html, sourceUrl, { imageInspector, mode = "html" } = {}) {
  const analysis = analyzeHtml(html, sourceUrl);
  analysis.source.mode = mode;
  const inspect = async (image) => {
    if (!image.url || typeof imageInspector !== "function") return null;
    try {
      return await imageInspector(image.url);
    } catch (error) {
      return {
        url: image.url,
        reachable: false,
        error: Number.isInteger(error.statusCode)
          ? error.message
          : "The image could not be inspected.",
      };
    }
  };

  const [openGraph, twitter] = await Promise.all([
    inspect(analysis.metadata.openGraph.image),
    analysis.metadata.twitter.image.url === analysis.metadata.openGraph.image.url
      ? Promise.resolve(null)
      : inspect(analysis.metadata.twitter.image),
  ]);

  const imageResult = (id, label, report) => {
    if (!report) return null;
    const category = id.startsWith("og-") ? "open-graph" : "twitter";
    if (!report.reachable) {
      return {
        id,
        category,
        severity: "error",
        status: "error",
        message: `${label} ${report.error || "could not be inspected."}`,
        evidence: report.url || "",
        weight: 10,
      };
    }
    if (!report.https) {
      return {
        id,
        category,
        severity: "warning",
        status: "warning",
        message: `${label} should use HTTPS.`,
        evidence: report.url,
        weight: 3,
      };
    }
    if (!report.recommendedDimensions) {
      return {
        id,
        category,
        severity: "warning",
        status: "warning",
        message: `${label} is ${report.width} × ${report.height}; consider 1200 × 630.`,
        evidence: `${report.contentType}, ${report.bytes} bytes`,
        weight: 3,
      };
    }
    return {
      id,
      category,
      severity: "pass",
      status: "pass",
      message: `${label} is reachable and uses the recommended dimensions.`,
      evidence: `${report.width} × ${report.height}, ${report.contentType}`,
      weight: 0,
    };
  };

  const twitterReport = twitter || (
    analysis.metadata.twitter.image.url &&
    analysis.metadata.twitter.image.url === analysis.metadata.openGraph.image.url
      ? openGraph
      : null
  );
  const replacements = [
    imageResult("og-image", "Open Graph image", openGraph),
    analysis.metadata.twitter.image.raw
      ? imageResult("twitter-image", "Twitter image", twitterReport)
      : null,
  ].filter(Boolean);
  for (const replacement of replacements) {
    const index = analysis.checks.findIndex((check) => check.id === replacement.id);
    if (index >= 0) analysis.checks[index] = replacement;
  }

  return {
    ...analysis,
    score: summarizeChecks(analysis.checks),
    images: { openGraph, twitter: twitterReport },
  };
}

module.exports = { analyzeDocument, analyzeHtml };
